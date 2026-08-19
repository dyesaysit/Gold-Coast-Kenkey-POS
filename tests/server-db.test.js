/*
 * tests/server-db.test.js
 * Phase 2 database layer tests. Run with:
 *   node --experimental-sqlite tests/server-db.test.js
 * Uses in-memory databases so nothing touches disk.
 *
 * The headline test is FIDELITY: seed the real catalogue, reassemble it from the
 * normalized tables, and prove it deep-equals the original object shapes — so
 * normalization never loses or alters a field the client depends on.
 */
"use strict";

var path = require("node:path");
var db = require("../server/db.js");
var seedLoader = require("../server/seed-loader.js");

var failures = 0;
function fail(msg) { failures++; console.error("FAIL: " + msg); }
function assert(cond, msg) { if (!cond) { fail(msg); } }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) { fail(msg + " (expected " + expected + ", got " + actual + ")"); }
}

// Deep structural equality; returns the first differing path or null if equal.
function diff(a, b, pathStr) {
  pathStr = pathStr || "";
  if (a === b) { return null; }
  if (typeof a !== typeof b) { return pathStr + " type " + typeof a + " vs " + typeof b; }
  if (a === null || b === null) { return pathStr + " null mismatch"; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { return pathStr + " array mismatch"; }
    if (a.length !== b.length) { return pathStr + " length " + a.length + " vs " + b.length; }
    for (var i = 0; i < a.length; i++) { var d = diff(a[i], b[i], pathStr + "[" + i + "]"); if (d) { return d; } }
    return null;
  }
  if (typeof a === "object") {
    var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join(",") !== kb.join(",")) { return pathStr + " keys {" + ka.join(",") + "} vs {" + kb.join(",") + "}"; }
    for (var j = 0; j < ka.length; j++) { var dd = diff(a[ka[j]], b[ka[j]], pathStr + "." + ka[j]); if (dd) { return dd; } }
    return null;
  }
  return pathStr + " " + JSON.stringify(a) + " vs " + JSON.stringify(b);
}
function assertDeepEqual(actual, expected, msg) {
  var d = diff(actual, expected);
  if (d) { fail(msg + " -> differs at " + d); }
}

var KEYS = db.KEYS;

// =====================================================================
// 1. FIDELITY — real catalogue round-trips through the normalized tables
// =====================================================================
var realSeed = seedLoader.loadSeedData(path.join(__dirname, ".."));
var store = db.open(":memory:");
assert(store.seedIfEmpty(realSeed), "seed the real catalogue");
var all = store.getAll();

assertDeepEqual(all[KEYS.categories], realSeed.categories, "categories round-trip");
// Cashiers round-trip WITHOUT their PIN (hashed + never exposed via bootstrap).
assertDeepEqual(all[KEYS.cashiers], realSeed.cashiers.map(function (c) {
  return { id: c.id, name: c.name, role: c.role, active: c.active };
}), "cashiers round-trip without pin");
assert(all[KEYS.cashiers].every(function (c) { return !("pin" in c) && !("pinHash" in c); }), "bootstrap never exposes pin/pinHash");
// PIN login is verified server-side against the stored hash.
assert(!!store.verifyLogin("3333"), "admin logs in with the seeded PIN");
assertEqual(store.verifyLogin("3333").role, "admin", "verifyLogin returns the right role");
assertEqual(store.verifyLogin("0000"), null, "wrong PIN does not log in");
assertDeepEqual(all[KEYS.proteins], realSeed.proteins, "proteins round-trip");
assertDeepEqual(all[KEYS.extras], realSeed.extras, "extras round-trip");
assertDeepEqual(all[KEYS.menuItems], realSeed.menuItems, "menuItems round-trip (incl. portionIds + allowedExtraIds)");
assertDeepEqual(all[KEYS.portions], realSeed.portions, "portions round-trip (incl. allowedProteinIds)");
assertDeepEqual(all[KEYS.inventoryProducts], realSeed.inventoryProducts, "inventoryProducts round-trip");
assertDeepEqual(all[KEYS.settings], realSeed.settings, "settings round-trip");

// Relationships are real: a meal's portions all point back to it.
var jollofPortions = store.getCollection("portions").filter(function (p) { return p.menuItemId === "jollof-fried-rice"; });
assertEqual(jollofPortions.length, 8, "jollof has its 8 portions linked by menuItemId");

// =====================================================================
// 2. Sales fidelity — a realistic sale (cashier, payment, nested meal item)
// =====================================================================
var day = new Date("2026-08-18T09:00:00.000Z");
var mealSale = {
  id: "sale-meal-1",
  cashier: { id: "user-admin", name: "Admin" },
  items: [{
    id: "cart-1", itemType: "configured-meal", productId: "jollof-fried-rice", productName: "Jollof / Fried Rice",
    image: "images/jollof.jpg", portion: { id: "jfr-42", name: "Jollof or Fried Rice", basePrice: 42 },
    includedContents: "3 cups rice, 2 chicken", protein: null,
    extras: [{ id: "jfr-fish", name: "1 fish", unitPrice: 15, quantity: 1, lineTotal: 15 }],
    unitTotal: 57, quantity: 1, lineTotal: 57
  }],
  subtotal: 57, discount: 0, total: 57,
  payment: { method: "cash", amountPaid: 60, change: 3 },
  status: "completed"
};
var r = store.completeSale(mealSale, day);
assertEqual(r.sale.receiptNumber, "GCK-20260818-0001", "meal sale gets a server receipt number");
var storedSale = store.getSales()[0];
assertEqual(storedSale.receiptNumber, "GCK-20260818-0001", "sale persisted with its receipt number");
assertDeepEqual(storedSale.items, mealSale.items, "nested meal line item preserved exactly");
assertDeepEqual(storedSale.cashier, mealSale.cashier, "sale cashier preserved");
assertDeepEqual(storedSale.payment, mealSale.payment, "sale payment preserved");

// =====================================================================
// 3. Behaviour — receipt numbering + stock decrement via a real UPDATE
// =====================================================================
var behave = db.open(":memory:");
behave.seedIfEmpty({
  settings: { businessName: "Test Kitchen", receiptPrefix: "GCK", dataVersion: 2 },
  cashiers: [{ id: "u1", name: "Admin", pin: "1234", role: "admin", active: true }],
  categories: [{ id: "drinks", name: "Drinks", displayOrder: 1, active: true }],
  menuItems: [], portions: [], proteins: [], extras: [],
  inventoryProducts: [{ id: "water", name: "Water", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 3, stockQuantity: 10, lowStockLevel: 2, active: true, productType: "simple", trackInventory: true }]
});
assertEqual(behave.generateReceiptNumber(day), "GCK-20260818-0001", "first receipt of the day");
behave.completeSale({ id: "s1", items: [{ productId: "water", quantity: 4, trackInventory: true }], total: 12 }, day);
assertEqual(behave.getCollection("inventoryProducts")[0].stockQuantity, 6, "stock 10 - 4 = 6 (SQL UPDATE)");
behave.completeSale({ id: "s2", items: [{ productId: "water", quantity: 100, trackInventory: true }], total: 300 }, day);
assertEqual(behave.getCollection("inventoryProducts")[0].stockQuantity, 0, "stock never goes below zero");
assertEqual(behave.getSales()[1].receiptNumber, "GCK-20260818-0002", "second receipt increments");

// =====================================================================
// 4. replaceCollection + backup round-trip
// =====================================================================
store.replaceCollection("categories", [{ id: "food", name: "Food", displayOrder: 1, active: true }, { id: "drinks", name: "Drinks", displayOrder: 2, active: false }]);
var cats = store.getCollection("categories");
assertEqual(cats.length, 2, "categories replaced");
assertEqual(cats[0].id, "food", "collection order preserved");
assertEqual(cats[1].active, false, "inactive flag preserved through replace");

var backup = store.exportBackup(day);
assertEqual(backup.backupFormat, "gckpos-backup", "backup format name");
assertEqual(backup.appDataVersion, 2, "app data version from settings");
var restored = db.open(":memory:");
assert(restored.importBackup(backup).ok, "importBackup accepts the backup");
assertEqual(diff(restored.getAll(), store.getAll()), null, "restored database matches the source exactly");
assert(!!restored.verifyLogin("3333"), "login still works after a backup restore (pin hash preserved)");
assert(!restored.importBackup({ backupFormat: "nope" }).ok, "rejects a non-POS file");

store.close(); behave.close(); restored.close();

if (failures === 0) { console.log("Server database tests passed."); }
else { console.error(failures + " server database test(s) failed."); process.exit(1); }
