/*
 * server/seed-loader.js
 * Loads the browser seed file (js/data/seed-data.js) inside a tiny sandbox so
 * the server seeds the database from the SAME source of truth as the client.
 * The seed file is a browser IIFE that assigns window.GCK.seedData, so we give
 * it a minimal window shim and read the value back out.
 */
"use strict";

var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function loadSeedData(projectRoot) {
  var file = path.join(projectRoot, "js", "data", "seed-data.js");
  var code = fs.readFileSync(file, "utf8");
  var windowShim = { GCK: {} };
  var sandbox = { window: windowShim, console: console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return windowShim.GCK.seedData || null;
}

module.exports = { loadSeedData: loadSeedData };
