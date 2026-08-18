/*
 * server-sync.js
 * Phase 2 client data gateway (see docs/ROADMAP.md, server/README.md).
 *
 * The app keeps using the SYNCHRONOUS storage-service everywhere. This gateway
 * only changes what happens around it, in two modes decided once at startup:
 *
 *   - Local mode (opened as a file, or served without the Phase 2 server):
 *     nothing changes. storage-service reads/writes localStorage exactly as
 *     before. This is the graded Phase 1 behaviour.
 *
 *   - Server mode (served by server/server.js): at startup the local cache is
 *     hydrated from the server, catalogue writes are mirrored to the server, and
 *     checkout goes through the atomic /api/sales endpoint so the server assigns
 *     receipt numbers and decrements stock. localStorage stays as the local read
 *     cache, so the rest of the app is unchanged.
 *
 * Per-device data (current cart, session) is never mirrored.
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var serverMode = false;
  var originals = {};

  // Catalogue collections mirrored to the server. saveProduct/saveCashier call
  // these internally, so wrapping these covers those too. Cart/session are
  // intentionally excluded (per-device).
  var COLLECTION_ROUTES = [
    { fn: "saveCategories", name: "categories" },
    { fn: "saveMenuItems", name: "menuItems" },
    { fn: "savePortions", name: "portions" },
    { fn: "saveProteins", name: "proteins" },
    { fn: "saveExtras", name: "extras" },
    { fn: "saveInventoryProducts", name: "inventoryProducts" },
    { fn: "saveCashiers", name: "cashiers" }
  ];

  function isServerMode() { return serverMode; }

  function warn(message) {
    if (typeof console !== "undefined" && console.warn) { console.warn("[server-sync] " + message); }
  }

  function jsonHeaders() { return { "Content-Type": "application/json" }; }

  // --- write mirroring -----------------------------------------------------

  function pushCollection(name, value) {
    global.fetch("/api/collections/" + name, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify(value)
    }).then(function (res) {
      if (!res.ok) { warn("server rejected update to " + name); }
    }).catch(function () { warn("could not reach server to sync " + name); });
  }

  function pushSettings(value) {
    global.fetch("/api/settings", {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify(value)
    }).catch(function () { warn("could not reach server to sync settings"); });
  }

  function wrapWrites() {
    COLLECTION_ROUTES.forEach(function (route) {
      originals[route.fn] = storage[route.fn];
      storage[route.fn] = function (value) {
        var ok = originals[route.fn](value);
        if (ok) { pushCollection(route.name, value); }
        return ok;
      };
    });
    originals.saveSettings = storage.saveSettings;
    storage.saveSettings = function (value) {
      var ok = originals.saveSettings(value);
      if (ok) { pushSettings(value); }
      return ok;
    };
  }

  // --- local cache hydration ----------------------------------------------

  // Write the server snapshot straight into localStorage, bypassing the wrapped
  // save functions so hydration never echoes back to the server.
  function hydrateFromServer(data) {
    Object.keys(data).forEach(function (key) {
      try { global.localStorage.setItem(key, JSON.stringify(data[key])); }
      catch (error) { warn("could not cache " + key + " locally"); }
    });
  }

  function fetchBootstrap() {
    return global.fetch("/api/bootstrap")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (payload) {
        if (payload && payload.ok && payload.data) { hydrateFromServer(payload.data); return true; }
        return false;
      })
      .catch(function () { return false; });
  }

  /**
   * Decide the mode and prepare the cache. Always resolves (never rejects) so
   * app start-up proceeds even if the server is briefly unreachable.
   */
  function bootstrap() {
    return global.fetch("/api/health")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (health) {
        if (!health || !health.ok) { return { serverMode: false }; }
        serverMode = true;
        return fetchBootstrap().then(function () {
          wrapWrites();
          return { serverMode: true };
        });
      })
      .catch(function () { serverMode = false; return { serverMode: false }; });
  }

  /** Pull the latest server snapshot into the local cache (no re-render here). */
  function refresh() {
    if (!serverMode) { return global.Promise.resolve(false); }
    return fetchBootstrap();
  }

  // --- checkout ------------------------------------------------------------

  /**
   * Complete a sale. Returns a Promise so the one call site can handle both the
   * instant local path and the networked server path uniformly.
   * Resolves { success, sale, message }.
   */
  function completeSale(sale) {
    if (!serverMode) {
      var completion = storage.completeSale(sale);
      return global.Promise.resolve({ success: completion.success, message: completion.message, sale: sale });
    }
    var payload = {};
    Object.keys(sale).forEach(function (k) { payload[k] = sale[k]; });
    delete payload.receiptNumber; // the server assigns the authoritative number

    return global.fetch("/api/sales", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(payload) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { res: res, body: body }; });
      })
      .then(function (r) {
        if (!r.res.ok || !r.body.ok) {
          return { success: false, message: (r.body && r.body.error) || "The server could not save the sale." };
        }
        // Apply the server's authoritative result to the local cache without
        // echoing it back (use the unwrapped inventory save; sales/cart writes
        // are not mirrored).
        var saveInventory = originals.saveInventoryProducts || storage.saveInventoryProducts;
        saveInventory(r.body.inventory);
        storage.saveSale(r.body.sale);
        storage.clearCurrentCart();
        return { success: true, sale: r.body.sale };
      })
      .catch(function () {
        return { success: false, message: "Could not reach the server. Check the Wi-Fi connection and try again." };
      });
  }

  // --- backup / restore ----------------------------------------------------

  function pad(value) { var s = String(value); return s.length < 2 ? "0" + s : s; }

  function backupFilename() {
    var d = new Date();
    return "GCKPOS-backup-" + pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".json";
  }

  /** Server-mode export: download the authoritative backup from the database. */
  function fetchServerBackup() {
    return global.fetch("/api/backup")
      .then(function (res) {
        if (!res.ok) { return { ok: false, message: "Could not download the backup from the server." }; }
        return res.text().then(function (json) { return { ok: true, json: json, filename: backupFilename() }; });
      })
      .catch(function () { return { ok: false, message: "Could not reach the server for the backup." }; });
  }

  /** Server-mode restore: replace all data in the database. */
  function restoreOnServer(backup) {
    return global.fetch("/api/restore", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(backup) })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; }).then(function (body) { return { res: res, body: body }; });
      })
      .then(function (r) {
        if (!r.res.ok || !r.body.ok) {
          return { ok: false, message: (r.body && r.body.message) || "The server could not restore this backup." };
        }
        return { ok: true };
      })
      .catch(function () { return { ok: false, message: "Could not reach the server to restore." }; });
  }

  global.GCK = global.GCK || {};
  global.GCK.data = {
    bootstrap: bootstrap,
    refresh: refresh,
    isServerMode: isServerMode,
    completeSale: completeSale,
    fetchServerBackup: fetchServerBackup,
    restoreOnServer: restoreOnServer
  };
})(window);
