/*
 * electron/main.js
 * Desktop wrapper for the Gold Coast Kenkey POS (see docs/INSTALLER.md).
 *
 * On launch it: picks a free port, starts the bundled Phase 2 server as a child
 * process (using Electron's own Node via ELECTRON_RUN_AS_NODE, with the SQLite
 * flag and a writable per-user data directory), waits for it to be healthy, then
 * opens a window pointed at it. Phone access is off by default and toggled from
 * the "Phones" menu, which flips the server between localhost-only and LAN.
 */
"use strict";

var electron = require("electron");
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Menu = electron.Menu;
var dialog = electron.dialog;
var spawn = require("node:child_process").spawn;
var path = require("node:path");
var http = require("node:http");
var net = require("node:net");
var fs = require("node:fs");
var os = require("node:os");

var APP_ROOT = path.join(__dirname, "..");
var SERVER_ENTRY = path.join(APP_ROOT, "server", "server.js");

var serverProc = null;
var win = null;
var serverPort = null;
var serverHost = "127.0.0.1";

function prefsFile() { return path.join(app.getPath("userData"), "gckpos-prefs.json"); }
function readPrefs() {
  try { return JSON.parse(fs.readFileSync(prefsFile(), "utf8")); } catch (e) { return {}; }
}
function writePrefs(p) {
  try { fs.writeFileSync(prefsFile(), JSON.stringify(p, null, 2)); } catch (e) { /* ignore */ }
}

function findFreePort() {
  return new Promise(function (resolve, reject) {
    var s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", function () {
      var p = s.address().port;
      s.close(function () { resolve(p); });
    });
  });
}

// Start the server as a child running under Electron's bundled Node. The
// --experimental-sqlite flag enables node:sqlite; the env sets a writable data
// directory and the localhost/LAN binding.
function startServer(port, host) {
  var env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: "1",
    GCKPOS_DATA_DIR: app.getPath("userData"),
    GCKPOS_HOST: host,
    PORT: String(port)
  });
  var child = spawn(process.execPath, ["--experimental-sqlite", "--no-warnings", SERVER_ENTRY], {
    env: env, stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", function (d) { process.stdout.write("[server] " + d); });
  child.stderr.on("data", function (d) { process.stderr.write("[server] " + d); });
  return child;
}

function waitForHealth(port, tries) {
  return new Promise(function (resolve) {
    function attempt(n) {
      var req = http.get({ host: "127.0.0.1", port: port, path: "/api/health", timeout: 1000 }, function (res) {
        res.resume();
        if (res.statusCode === 200) { resolve(true); } else { retry(n); }
      });
      req.on("error", function () { retry(n); });
      req.on("timeout", function () { req.destroy(); retry(n); });
    }
    function retry(n) { if (n <= 0) { resolve(false); } else { setTimeout(function () { attempt(n - 1); }, 300); } }
    attempt(tries);
  });
}

function lanAddress() {
  var nets = os.networkInterfaces();
  var keys = Object.keys(nets);
  for (var i = 0; i < keys.length; i++) {
    var list = nets[keys[i]];
    for (var j = 0; j < list.length; j++) {
      if (list[j].family === "IPv4" && !list[j].internal) { return list[j].address; }
    }
  }
  return null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "Gold Coast Kenkey POS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.loadURL("http://localhost:" + serverPort);
  win.once("ready-to-show", function () { win.show(); });
  win.on("closed", function () { win = null; });
}

function restartServerWithHost(host) {
  serverHost = host;
  if (serverProc) { try { serverProc.kill(); } catch (e) { /* ignore */ } }
  serverProc = startServer(serverPort, host);
  waitForHealth(serverPort, 40).then(function () { if (win) { win.reload(); } });
}

function showPhoneAddress() {
  if (serverHost !== "0.0.0.0") {
    dialog.showMessageBox(win, {
      type: "info", title: "Phone access is off",
      message: "Turn on \"Allow phones on Wi-Fi\" in the Phones menu first, then open this again."
    });
    return;
  }
  var lan = lanAddress();
  dialog.showMessageBox(win, {
    type: "info", title: "Phone access",
    message: lan
      ? "On a phone connected to the SAME Wi-Fi, open this address in its browser:\n\n    http://" + lan + ":" + serverPort + "\n\nThe cashier signs in with their PIN."
      : "Could not detect a Wi-Fi address. Make sure the till PC is connected to Wi-Fi."
  });
}

function buildMenu() {
  var prefs = readPrefs();
  var template = [
    { label: "File", submenu: [{ role: "quit" }] },
    {
      label: "Phones",
      submenu: [
        {
          label: "Allow phones on Wi-Fi",
          type: "checkbox",
          checked: !!prefs.allowPhones,
          click: function (item) {
            var p = readPrefs();
            p.allowPhones = item.checked;
            writePrefs(p);
            restartServerWithHost(item.checked ? "0.0.0.0" : "127.0.0.1");
            if (item.checked) { showPhoneAddress(); }
          }
        },
        { label: "Show phone address…", click: showPhoneAddress }
      ]
    },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function boot() {
  var prefs = readPrefs();
  serverHost = prefs.allowPhones ? "0.0.0.0" : "127.0.0.1";
  findFreePort().then(function (port) {
    serverPort = port;
    serverProc = startServer(serverPort, serverHost);
    return waitForHealth(serverPort, 40);
  }).then(function (ok) {
    if (!ok) {
      dialog.showErrorBox("Startup failed", "The POS server did not start. Please reinstall the app.");
      app.quit();
      return;
    }
    createWindow();
    buildMenu();
  });
}

// Single instance: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", function () { if (win) { if (win.isMinimized()) { win.restore(); } win.focus(); } });
  app.whenReady().then(boot);
}

app.on("window-all-closed", function () { app.quit(); });
app.on("before-quit", function () { if (serverProc) { try { serverProc.kill(); } catch (e) { /* ignore */ } } });
app.on("activate", function () { if (BrowserWindow.getAllWindows().length === 0 && serverPort) { createWindow(); } });
