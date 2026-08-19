/*
 * server/server.js
 * Phase 2 optional server (see docs/ROADMAP.md). Serves the existing POS app to
 * every device on the same Wi-Fi and exposes a small REST API backed by SQLite,
 * so the till and phones share one live dataset.
 *
 * Zero external dependencies: Node's built-in http + node:sqlite only.
 * Run with:  npm start        (adds the --experimental-sqlite flag)
 *        or  node --experimental-sqlite server/server.js
 */
"use strict";

var http = require("node:http");
var fs = require("node:fs");
var path = require("node:path");
var db = require("./db.js");
var seedLoader = require("./seed-loader.js");

var PROJECT_ROOT = path.join(__dirname, "..");
// The database must live in a WRITABLE location. When packaged (e.g. Electron),
// the install folder is read-only, so the host sets GCKPOS_DATA_DIR to a per-user
// data path (Electron: app.getPath("userData")). Falls back to server/data for
// plain `npm start` during development.
var DATA_DIR = process.env.GCKPOS_DATA_DIR || path.join(__dirname, "data");
var DB_FILE = path.join(DATA_DIR, "gckpos.db");
// Default 4000, not 3000, since 3000 is a common port for other dev servers.
// If the chosen port is busy the server hunts upward for a free one (below).
var PORT = Number(process.env.PORT) || 4000;
var MAX_PORT_TRIES = 15;
// Bind localhost-only by default so a single-machine install never exposes the
// (currently login-less) API to the network. Set GCKPOS_HOST=0.0.0.0 to allow
// phones / other devices on the SAME TRUSTED Wi-Fi to connect.
var HOST = process.env.GCKPOS_HOST || "127.0.0.1";
var LAN_ENABLED = HOST === "0.0.0.0" || HOST === "::";

// --- database bootstrap --------------------------------------------------
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }
var store = db.open(DB_FILE);
var seeded = store.seedIfEmpty(seedLoader.loadSeedData(PROJECT_ROOT));
if (seeded) { console.log("Seeded a fresh database with sample data."); }

// --- static file serving -------------------------------------------------
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

// Security headers (docs/SECURITY.md section 3) — these can only be set as HTTP
// headers by a server, which is exactly what we now have.
function applyBaseHeaders(res) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res, status, body) {
  applyBaseHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// Only these top-level folders/files are meant for the browser. Everything else
// (server source, tests, docs, dotfiles, the database) is never served.
var PUBLIC_TOP_LEVEL = { "index.html": true, "css": true, "js": true, "images": true, "favicon.ico": true };

function serveStatic(req, res, urlPath) {
  var decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded === "/") { decoded = "/index.html"; }
  var target = path.normalize(path.join(PROJECT_ROOT, decoded));
  // Path-traversal guard: never serve outside the project root.
  if (target !== PROJECT_ROOT && target.indexOf(PROJECT_ROOT + path.sep) !== 0) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  // Only expose the browser-facing files; hide server code, docs, dotfiles, etc.
  var segments = decoded.split("/").filter(Boolean);
  var top = segments[0];
  var hidden = segments.some(function (s) { return s.charAt(0) === "."; });
  if (hidden || !top || !PUBLIC_TOP_LEVEL[top]) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  fs.readFile(target, function (err, content) {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    var type = CONTENT_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
    applyBaseHeaders(res);
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

// --- request body reader (with a size cap) -------------------------------
var MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB, matching the backup import cap
function readBody(req, callback) {
  var chunks = [];
  var total = 0;
  var tooBig = false;
  req.on("data", function (chunk) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) { tooBig = true; req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on("end", function () {
    if (tooBig) { callback({ tooBig: true }); return; }
    if (chunks.length === 0) { callback({ value: null }); return; }
    try { callback({ value: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
    catch (error) { callback({ parseError: true }); }
  });
  req.on("error", function () { callback({ parseError: true }); });
}

// --- API routes ----------------------------------------------------------
function handleApi(req, res, urlPath) {
  var method = req.method;
  var parts = urlPath.split("?")[0].split("/").filter(Boolean); // ["api", ...]

  // GET /api/health
  if (method === "GET" && parts.length === 2 && parts[1] === "health") {
    var settings = store.getSettings() || {};
    sendJson(res, 200, { ok: true, mode: "server", businessName: settings.businessName || "" });
    return;
  }

  // GET /api/bootstrap  -> all collections keyed by storage key
  if (method === "GET" && parts[1] === "bootstrap") {
    sendJson(res, 200, { ok: true, data: store.getAll() });
    return;
  }

  // GET /api/sales
  if (method === "GET" && parts[1] === "sales" && parts.length === 2) {
    sendJson(res, 200, { ok: true, sales: store.getSales() });
    return;
  }

  // POST /api/sales  -> atomic checkout (server assigns the receipt number)
  if (method === "POST" && parts[1] === "sales" && parts.length === 2) {
    readBody(req, function (body) {
      if (body.tooBig) { sendJson(res, 413, { ok: false, error: "Payload too large" }); return; }
      if (body.parseError || !body.value || typeof body.value !== "object") {
        sendJson(res, 400, { ok: false, error: "Invalid sale" });
        return;
      }
      try {
        var result = store.completeSale(body.value, new Date());
        sendJson(res, 201, { ok: true, sale: result.sale, inventory: result.inventory });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: "Could not save the sale: " + error.message });
      }
    });
    return;
  }

  // GET/PUT /api/settings
  if (parts[1] === "settings" && parts.length === 2) {
    if (method === "GET") { sendJson(res, 200, { ok: true, settings: store.getSettings() }); return; }
    if (method === "PUT") {
      readBody(req, function (body) {
        if (body.parseError || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
          sendJson(res, 400, { ok: false, error: "Invalid settings" });
          return;
        }
        store.saveSettings(body.value);
        sendJson(res, 200, { ok: true });
      });
      return;
    }
  }

  // PUT /api/collections/:name  -> replace a whole catalogue collection
  if (method === "PUT" && parts[1] === "collections" && parts.length === 3) {
    var name = parts[2];
    readBody(req, function (body) {
      if (body.parseError || body.value === null || body.value === undefined) {
        sendJson(res, 400, { ok: false, error: "Invalid collection payload" });
        return;
      }
      try {
        store.replaceCollection(name, body.value);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
    });
    return;
  }

  // GET /api/backup  -> download a gckpos-backup file
  if (method === "GET" && parts[1] === "backup" && parts.length === 2) {
    var backup = store.exportBackup(new Date());
    applyBaseHeaders(res);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gckpos-backup.json"'
    });
    res.end(JSON.stringify(backup, null, 2));
    return;
  }

  // POST /api/restore  -> replace ALL data from a gckpos-backup file
  if (method === "POST" && parts[1] === "restore" && parts.length === 2) {
    readBody(req, function (body) {
      if (body.tooBig) { sendJson(res, 413, { ok: false, error: "Backup file too large" }); return; }
      if (body.parseError || !body.value) { sendJson(res, 400, { ok: false, error: "Invalid backup file" }); return; }
      var result = store.importBackup(body.value);
      sendJson(res, result.ok ? 200 : 400, result);
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Unknown API route" });
}

// --- server --------------------------------------------------------------
var server = http.createServer(function (req, res) {
  var urlPath = req.url || "/";
  if (urlPath === "/api" || urlPath.indexOf("/api/") === 0) {
    handleApi(req, res, urlPath);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  // The app ships no favicon; answer the browser's automatic request quietly
  // instead of logging a 404.
  if (urlPath === "/favicon.ico") {
    applyBaseHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }
  serveStatic(req, res, urlPath);
});

function announce(port) {
  console.log("Gold Coast Kenkey POS server running.");
  console.log("  On this computer:   http://localhost:" + port);
  if (LAN_ENABLED) {
    var nets = require("node:os").networkInterfaces();
    var lan = null;
    Object.keys(nets).forEach(function (iface) {
      nets[iface].forEach(function (net) {
        if (net.family === "IPv4" && !net.internal && !lan) { lan = net.address; }
      });
    });
    if (lan) { console.log("  On phones (Wi-Fi):  http://" + lan + ":" + port); }
    console.log("  NOTE: network access is ON and the API has no login yet —");
    console.log("        only run this on a trusted private Wi-Fi.");
  } else {
    console.log("  (Local only. For phones on the same Wi-Fi: $env:GCKPOS_HOST='0.0.0.0'; npm start)");
  }
  console.log("  Database file:      " + DB_FILE);
}

// Start on PORT; if it is already taken (e.g. another dev server), quietly try
// the next port up instead of crashing, so it never clashes with other apps.
// Each attempt attaches exactly one 'error' and one 'listening' handler and
// removes its counterpart, so a failed bind never leaves a stale callback that
// would announce the wrong port.
function startServer(port, triesLeft) {
  function onError(err) {
    server.removeListener("listening", onListening);
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      console.log("Port " + port + " is in use, trying " + (port + 1) + "...");
      startServer(port + 1, triesLeft - 1);
    } else if (err.code === "EADDRINUSE") {
      console.error("Could not find a free port near " + PORT + ".");
      console.error("Pick one yourself, e.g.  $env:PORT=5050; npm start");
      process.exit(1);
    } else {
      throw err;
    }
  }
  function onListening() {
    server.removeListener("error", onError);
    announce(port);
  }
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port, HOST);
}

startServer(PORT, MAX_PORT_TRIES);
