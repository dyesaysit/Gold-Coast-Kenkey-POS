/*
 * tests/server-db.test.js
 * Phase 2 database layer tests. Run with:
 *   node --experimental-sqlite tests/server-db.test.js
 * Uses an in-memory database so nothing touches disk.
 */
"use strict";

var path = require("node:path");
var db = require("../server/db.js");
var seedLoader = require("../server/seed-loader.js");

var failures = 0;
function assert(condition, message) {
  if (!condition) { failures++; console.error("FAIL: " + message); }
}
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failures++;
    console.error("FAIL: " + message + " (expected " + expected + ", got " + actual + ")");
  }
}

var KEYS = db.KEYS;

// A small deterministic seed for precise assertions.
var SEED = {
  settings: { businessName: "Test Kitchen", receiptPrefix: "GCK", currencySymbol: "GH₵", dataVersion: 2 },
  cashiers: [{ id: "u1", name: "Admin", role: "admin", pin: "1234" }],
  categories: [{ id: "drinks", name: "Drinks" }],
  menuItems: [],
  portions: [],
  proteins: [],
  extras: [],
  inventoryProducts: [
    { id: "water", name: "Bottled Water", productType: "simple", trackInventory: true, stockQuantity: 10, sellingPrice: 3 }
  ]
};

// --- seeding -------------------------------------------------------------
var store = db.open(":memory:");
assert(store.isEmpty(), "fresh database is empty");
assert(store.seedIfEmpty(SEED), "seedIfEmpty seeds an empty database");
assert(!store.isEmpty(), "database is not empty after seeding");
assert(!store.seedIfEmpty(SEED), "seedIfEmpty does nothing when already seeded");

var all = store.getAll();
assertEqual(all[KEYS.categories].length, 1, "one seeded category");
assertEqual(all[KEYS.inventoryProducts].length, 1, "one seeded product");
assertEqual(all[KEYS.settings].businessName, "Test Kitchen", "settings round-trip");
assert(Array.isArray(all[KEYS.sales]) && all[KEYS.sales].length === 0, "no sales yet");

// --- receipt numbering ---------------------------------------------------
var day = new Date("2026-08-18T09:00:00.000Z");
assertEqual(store.generateReceiptNumber(day), "GCK-20260818-0001", "first receipt number of the day");

// --- completeSale: stock decrement + receipt numbering -------------------
var r1 = store.completeSale({
  items: [{ productId: "water", quantity: 4, trackInventory: true }],
  total: 12
}, day);
assertEqual(r1.sale.receiptNumber, "GCK-20260818-0001", "sale 1 gets receipt 0001");
assert(!!r1.sale.createdAt, "sale 1 got a createdAt");
assertEqual(store.getAll()[KEYS.inventoryProducts][0].stockQuantity, 6, "stock 10 - 4 = 6");

var r2 = store.completeSale({
  items: [{ productId: "water", quantity: 100, trackInventory: true }],
  total: 300
}, day);
assertEqual(r2.sale.receiptNumber, "GCK-20260818-0002", "sale 2 increments to 0002");
assertEqual(store.getAll()[KEYS.inventoryProducts][0].stockQuantity, 0, "stock never goes below zero");
assertEqual(store.getSales().length, 2, "two sales recorded");

// --- replaceCollection round-trip ---------------------------------------
store.replaceCollection("categories", [{ id: "food", name: "Food" }, { id: "drinks", name: "Drinks" }]);
var cats = store.getAll()[KEYS.categories];
assertEqual(cats.length, 2, "categories replaced");
assertEqual(cats[0].id, "food", "collection order preserved");

// --- backup export / import round-trip ----------------------------------
var backup = store.exportBackup(day);
assertEqual(backup.backupFormat, "gckpos-backup", "backup format name");
assertEqual(backup.backupFormatVersion, 1, "backup format version");
assertEqual(backup.appDataVersion, 2, "app data version taken from settings");
assertEqual(backup.businessName, "Test Kitchen", "backup businessName");
assert(Array.isArray(backup.data[KEYS.sales]) && backup.data[KEYS.sales].length === 2, "backup carries sales");

var restored = db.open(":memory:");
var importResult = restored.importBackup(backup);
assert(importResult.ok, "importBackup accepts a valid backup");
assertEqual(JSON.stringify(restored.getAll()), JSON.stringify(store.getAll()), "restored database matches the source exactly");

// --- backup import rejects bad input ------------------------------------
assert(!restored.importBackup({ backupFormat: "nope" }).ok, "rejects a non-POS file");
assert(!restored.importBackup({ backupFormat: "gckpos-backup", backupFormatVersion: 1, appDataVersion: 1, data: {} }).ok, "rejects missing collections");

// --- seed-loader reads the real browser seed file ------------------------
var realSeed = seedLoader.loadSeedData(path.join(__dirname, ".."));
assert(realSeed && Array.isArray(realSeed.categories), "seed-loader loads real seed-data.js categories");
assert(Array.isArray(realSeed.inventoryProducts), "real seed has inventoryProducts");

store.close();
restored.close();

if (failures === 0) {
  console.log("Server database tests passed.");
} else {
  console.error(failures + " server database test(s) failed.");
  process.exit(1);
}
