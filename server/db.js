/*
 * server/db.js
 * Phase 2 database layer (see docs/ROADMAP.md). A small SQLite-backed store
 * that mirrors the client's storage contract (js/services/storage-service.js)
 * exactly, so the two are round-trip compatible and existing JSON backups load
 * unchanged.
 *
 * Design: each catalogue collection is stored as ordered JSON documents, one
 * row per array element, preserving order. This keeps perfect fidelity with the
 * client's object shapes (which every feature already depends on) while still
 * being a real, queryable SQLite database. The sales table additionally lifts
 * receipt_number and created_at into columns so lookups and history are indexed.
 *
 * Zero external dependencies: uses Node's built-in node:sqlite (Node 22+).
 */
"use strict";

// node:sqlite is built into Node 22.5+ (run with --experimental-sqlite). Fail
// with a clear, actionable message rather than a cryptic module error if this
// runtime does not have it — this is the capability the Electron installer must
// provide (Electron 35+ bundles Node 22; otherwise spawn the system Node).
var DatabaseSync;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch (error) {
  throw new Error(
    "node:sqlite is unavailable in this Node runtime. Node 22.5+ is required " +
    "(start with --experimental-sqlite). For the packaged app use Electron 35+ " +
    "(bundles Node 22) or spawn the system Node. Underlying error: " + error.message
  );
}
if (typeof DatabaseSync !== "function") {
  throw new Error("node:sqlite loaded but DatabaseSync is missing; upgrade to Node 22.5+.");
}

// storage key <-> table, matching storage-service.js KEYS exactly.
var COLLECTIONS = [
  { name: "categories", key: "gckpos.categories", table: "categories", kind: "array" },
  { name: "menuItems", key: "gckpos.menuItems", table: "menu_items", kind: "array" },
  { name: "portions", key: "gckpos.portions", table: "portions", kind: "array" },
  { name: "proteins", key: "gckpos.proteins", table: "proteins", kind: "array" },
  { name: "extras", key: "gckpos.extras", table: "extras", kind: "array" },
  { name: "inventoryProducts", key: "gckpos.inventoryProducts", table: "inventory_products", kind: "array" },
  { name: "cashiers", key: "gckpos.cashiers", table: "cashiers", kind: "array" },
  { name: "sales", key: "gckpos.sales", table: "sales", kind: "sales" },
  { name: "settings", key: "gckpos.settings", table: "settings", kind: "object" }
];

var KEYS = {};
COLLECTIONS.forEach(function (c) { KEYS[c.name] = c.key; });

// Backup format constants — must match js/services/backup-service.js.
var BACKUP_FORMAT_NAME = "gckpos-backup";
var BACKUP_FORMAT_VERSION = 1;
var SUPPORTED_DATA_VERSIONS = [1, 2];

var ARRAY_TABLES = ["categories", "menu_items", "portions", "proteins", "extras", "inventory_products", "cashiers"];

function collectionByKey(key) {
  for (var i = 0; i < COLLECTIONS.length; i++) {
    if (COLLECTIONS[i].key === key) { return COLLECTIONS[i]; }
  }
  return null;
}

function collectionByName(name) {
  for (var i = 0; i < COLLECTIONS.length; i++) {
    if (COLLECTIONS[i].name === name) { return COLLECTIONS[i]; }
  }
  return null;
}

function pad(value, width) {
  var s = String(value);
  while (s.length < width) { s = "0" + s; }
  return s;
}

function createSchema(db) {
  ARRAY_TABLES.forEach(function (table) {
    db.exec("CREATE TABLE IF NOT EXISTS " + table +
      " (seq INTEGER PRIMARY KEY AUTOINCREMENT, doc TEXT NOT NULL)");
  });
  db.exec(
    "CREATE TABLE IF NOT EXISTS sales (" +
    "seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, receipt_number TEXT, created_at TEXT, doc TEXT NOT NULL)"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_number)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)");
  db.exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), doc TEXT NOT NULL)");
}

/**
 * Open (or create) a database at the given file path (":memory:" for tests)
 * and return a small data-access API bound to it.
 */
function open(filePath) {
  var db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);

  // --- internal helpers (no transaction of their own) --------------------

  function readArray(table) {
    var rows = db.prepare("SELECT doc FROM " + table + " ORDER BY seq").all();
    return rows.map(function (row) { return JSON.parse(row.doc); });
  }

  function readSales() {
    var rows = db.prepare("SELECT doc FROM sales ORDER BY seq").all();
    return rows.map(function (row) { return JSON.parse(row.doc); });
  }

  function readSettings() {
    var row = db.prepare("SELECT doc FROM settings WHERE id = 1").get();
    return row ? JSON.parse(row.doc) : null;
  }

  function fillArrayInternal(table, items) {
    db.exec("DELETE FROM " + table);
    var insert = db.prepare("INSERT INTO " + table + " (doc) VALUES (?)");
    (items || []).forEach(function (item) { insert.run(JSON.stringify(item)); });
  }

  function fillSalesInternal(items) {
    db.exec("DELETE FROM sales");
    var insert = db.prepare("INSERT INTO sales (id, receipt_number, created_at, doc) VALUES (?, ?, ?, ?)");
    (items || []).forEach(function (sale) {
      insert.run(sale.id || null, sale.receiptNumber || null, sale.createdAt || null, JSON.stringify(sale));
    });
  }

  function appendSaleInternal(sale) {
    db.prepare("INSERT INTO sales (id, receipt_number, created_at, doc) VALUES (?, ?, ?, ?)")
      .run(sale.id || null, sale.receiptNumber || null, sale.createdAt || null, JSON.stringify(sale));
  }

  function writeSettingsInternal(settings) {
    db.prepare("INSERT INTO settings (id, doc) VALUES (1, ?) " +
      "ON CONFLICT(id) DO UPDATE SET doc = excluded.doc").run(JSON.stringify(settings || {}));
  }

  function transaction(work) {
    db.exec("BEGIN");
    try {
      var result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) { /* already failing */ }
      throw error;
    }
  }

  // --- public reads ------------------------------------------------------

  function getCollection(name) {
    var col = collectionByName(name);
    if (!col) { return null; }
    if (col.kind === "object") { return readSettings(); }
    if (col.kind === "sales") { return readSales(); }
    return readArray(col.table);
  }

  /** All persistent data keyed by storage key, matching getBackupData(). */
  function getAll() {
    var data = {};
    COLLECTIONS.forEach(function (col) {
      if (col.kind === "object") { data[col.key] = readSettings(); }
      else if (col.kind === "sales") { data[col.key] = readSales(); }
      else { data[col.key] = readArray(col.table); }
    });
    return data;
  }

  function getSettings() { return readSettings(); }
  function getSales() { return readSales(); }

  function isEmpty() {
    for (var i = 0; i < ARRAY_TABLES.length; i++) {
      var count = db.prepare("SELECT COUNT(*) AS n FROM " + ARRAY_TABLES[i]).get();
      if (count.n > 0) { return false; }
    }
    if (db.prepare("SELECT COUNT(*) AS n FROM sales").get().n > 0) { return false; }
    if (readSettings() !== null) { return false; }
    return true;
  }

  // --- public writes -----------------------------------------------------

  /** Replace a whole collection (mirrors the client's replace-array writes). */
  function replaceCollection(name, value) {
    var col = collectionByName(name);
    if (!col) { throw new Error("Unknown collection: " + name); }
    return transaction(function () {
      if (col.kind === "object") { writeSettingsInternal(value); }
      else if (col.kind === "sales") { fillSalesInternal(value); }
      else { fillArrayInternal(col.table, value); }
      return true;
    });
  }

  function replaceCollectionByKey(key, value) {
    var col = collectionByKey(key);
    if (!col) { throw new Error("Unknown storage key: " + key); }
    return replaceCollection(col.name, value);
  }

  function saveSettings(settings) {
    return transaction(function () { writeSettingsInternal(settings); return true; });
  }

  // --- receipt numbering (server-owned, safe across devices) -------------

  function generateReceiptNumber(now) {
    var settings = readSettings() || {};
    var prefix = settings.receiptPrefix || "GCK";
    var datePart = "" + now.getFullYear() + pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2);
    var todayPrefix = prefix + "-" + datePart + "-";
    var row = db.prepare("SELECT COUNT(*) AS n FROM sales WHERE receipt_number LIKE ?")
      .get(todayPrefix + "%");
    return todayPrefix + pad(row.n + 1, 4);
  }

  /**
   * Complete a sale atomically: assign a receipt number if missing, decrement
   * stock for tracked items, and append the sale — all in one transaction so
   * two tills can never collide on a number or oversell stock.
   * Returns { sale, inventory } with the persisted values.
   */
  function completeSale(sale, now) {
    now = now || new Date();
    return transaction(function () {
      var stored = Object.assign({}, sale);
      if (!stored.receiptNumber) { stored.receiptNumber = generateReceiptNumber(now); }
      if (!stored.createdAt) { stored.createdAt = now.toISOString(); }

      var inventory = readArray("inventory_products");
      var indexById = {};
      inventory.forEach(function (product, i) { indexById[product.id] = i; });

      var items = stored.items || [];
      items.forEach(function (item) {
        var tracked = (typeof item.trackInventory === "boolean")
          ? item.trackInventory
          : item.itemType === "inventory-product";
        if (tracked && indexById[item.productId] != null) {
          var product = inventory[indexById[item.productId]];
          var remaining = Number(product.stockQuantity) - Number(item.quantity);
          product.stockQuantity = remaining < 0 ? 0 : remaining;
        }
      });

      fillArrayInternal("inventory_products", inventory);
      appendSaleInternal(stored);
      return { sale: stored, inventory: inventory };
    });
  }

  // --- seeding -----------------------------------------------------------

  /** Seed sample data only when the database is completely empty. */
  function seedIfEmpty(seed) {
    if (!seed || !isEmpty()) { return false; }
    return transaction(function () {
      writeSettingsInternal(seed.settings || {});
      fillArrayInternal("cashiers", seed.cashiers || []);
      fillArrayInternal("categories", seed.categories || []);
      fillArrayInternal("menu_items", seed.menuItems || []);
      fillArrayInternal("portions", seed.portions || []);
      fillArrayInternal("proteins", seed.proteins || []);
      fillArrayInternal("extras", seed.extras || []);
      fillArrayInternal("inventory_products", seed.inventoryProducts || []);
      return true;
    });
  }

  // --- backup / restore (same file format as the client) -----------------

  function exportBackup(now) {
    now = now || new Date();
    var data = getAll();
    var settings = data[KEYS.settings] || {};
    data[KEYS.settings] = settings;
    return {
      backupFormat: BACKUP_FORMAT_NAME,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      appDataVersion: Number(settings.dataVersion) || 1,
      exportedAt: now.toISOString(),
      businessName: settings.businessName || "",
      data: data
    };
  }

  function validateBackupData(data) {
    var arrayKeys = ["categories", "menuItems", "portions", "proteins", "extras", "inventoryProducts", "sales", "cashiers"];
    if (!data || typeof data !== "object" || Array.isArray(data)) { return false; }
    for (var i = 0; i < arrayKeys.length; i++) {
      if (!Array.isArray(data[KEYS[arrayKeys[i]]])) { return false; }
    }
    var settings = data[KEYS.settings];
    return !!settings && typeof settings === "object" && !Array.isArray(settings);
  }

  /** Validate then replace ALL data from a gckpos-backup document. */
  function importBackup(backup) {
    if (!backup || backup.backupFormat !== BACKUP_FORMAT_NAME) {
      return { ok: false, code: "wrong-schema", message: "This is not a Gold Coast Kenkey POS backup." };
    }
    if (backup.backupFormatVersion !== BACKUP_FORMAT_VERSION) {
      return { ok: false, code: "unsupported-version", message: "This backup version is not supported." };
    }
    if (SUPPORTED_DATA_VERSIONS.indexOf(backup.appDataVersion) === -1) {
      return { ok: false, code: "unsupported-data-version", message: "This backup uses an unsupported data version." };
    }
    if (!validateBackupData(backup.data)) {
      return { ok: false, code: "wrong-schema", message: "The backup is missing required POS data." };
    }
    try {
      transaction(function () {
        writeSettingsInternal(backup.data[KEYS.settings] || {});
        fillArrayInternal("categories", backup.data[KEYS.categories]);
        fillArrayInternal("menu_items", backup.data[KEYS.menuItems]);
        fillArrayInternal("portions", backup.data[KEYS.portions]);
        fillArrayInternal("proteins", backup.data[KEYS.proteins]);
        fillArrayInternal("extras", backup.data[KEYS.extras]);
        fillArrayInternal("inventory_products", backup.data[KEYS.inventoryProducts]);
        fillArrayInternal("cashiers", backup.data[KEYS.cashiers]);
        fillSalesInternal(backup.data[KEYS.sales]);
        return true;
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: "write-failed", message: "Restore could not be saved: " + error.message };
    }
  }

  function close() { db.close(); }

  return {
    KEYS: KEYS,
    COLLECTIONS: COLLECTIONS,
    getCollection: getCollection,
    getAll: getAll,
    getSettings: getSettings,
    getSales: getSales,
    isEmpty: isEmpty,
    replaceCollection: replaceCollection,
    replaceCollectionByKey: replaceCollectionByKey,
    saveSettings: saveSettings,
    generateReceiptNumber: generateReceiptNumber,
    completeSale: completeSale,
    seedIfEmpty: seedIfEmpty,
    exportBackup: exportBackup,
    importBackup: importBackup,
    close: close
  };
}

module.exports = {
  open: open,
  COLLECTIONS: COLLECTIONS,
  KEYS: KEYS,
  BACKUP_FORMAT_NAME: BACKUP_FORMAT_NAME,
  BACKUP_FORMAT_VERSION: BACKUP_FORMAT_VERSION
};
