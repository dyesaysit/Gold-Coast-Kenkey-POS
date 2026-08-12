"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var values = {};
var operationCount = 0;
var failOnOperation = 0;
var failureName = "UnknownError";

var localStorage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
  setItem: function (key, value) {
    operationCount++;
    if (failOnOperation === operationCount) { var error = new Error("simulated failure"); error.name = failureName; throw error; }
    values[key] = String(value);
  },
  removeItem: function (key) {
    operationCount++;
    if (failOnOperation === operationCount) { var error = new Error("simulated failure"); error.name = failureName; throw error; }
    delete values[key];
  }
};

var context = {
  window: { GCK: { seedData: {} } }, localStorage: localStorage,
  console: { warn: function () {}, error: function () {} }, JSON: JSON, Date: Date,
  Math: Math, Number: Number, Object: Object, Array: Array, String: String
};
vm.createContext(context);
["storage-service.js", "backup-service.js"].forEach(function (name) {
  var filename = path.join(__dirname, "..", "js/services", name);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
});
var storage = context.window.GCK.storage;
var backupService = context.window.GCK.backup;

function assert(condition, message) { if (!condition) { throw new Error(message); } }
function rawSnapshot() { return JSON.stringify(values); }

function seedStore(label) {
  operationCount = 0; failOnOperation = 0; values = {};
  var arrayKeys = ["categories", "menuItems", "portions", "proteins", "extras", "inventoryProducts", "sales", "cashiers"];
  arrayKeys.forEach(function (name) { values[storage.KEYS[name]] = "[]"; });
  values[storage.KEYS.settings] = JSON.stringify({ businessName: label, shortName: "GCK", dataVersion: 2 });
  values[storage.KEYS.currentCart] = JSON.stringify([{ id: "temporary-cart" }]);
  values[storage.KEYS.session] = JSON.stringify({ id: "admin", role: "admin" });
}

seedStore("Export Business");
values[storage.KEYS.cashiers] = JSON.stringify([{ id: "u1" }, { id: "u2" }]);
values[storage.KEYS.menuItems] = JSON.stringify([{ id: "meal" }]);
values[storage.KEYS.inventoryProducts] = JSON.stringify([{ id: "water" }]);
values[storage.KEYS.sales] = JSON.stringify([{ id: "sale" }]);
values["unrelated.key"] = "private";
var exported = backupService.exportBackup("admin", new Date("2026-08-12T14:35:00"));
assert(exported.ok, "admin export succeeds");
assert(exported.filename === "GCKPOS-backup-12-08-2026-1435.json", "filename uses required date format");
assert(!Object.prototype.hasOwnProperty.call(exported.backup.data, "unrelated.key"), "unrelated storage is excluded");
assert(!Object.prototype.hasOwnProperty.call(exported.backup.data, storage.KEYS.currentCart), "temporary cart is excluded");
assert(!Object.prototype.hasOwnProperty.call(exported.backup.data, storage.KEYS.session), "session is excluded");
assert(!backupService.exportBackup("supervisor").ok && !backupService.exportBackup("cashier").ok, "non-admin export is blocked");

var parsed = backupService.parseBackup("admin", exported.json);
assert(parsed.ok, "valid backup parses");
assert(parsed.preview.usersCount === 2 && parsed.preview.productsCount === 2 && parsed.preview.salesCount === 1 && parsed.preview.inventoryProductsCount === 1, "preview counts are correct");
assert(parsed.preview.backupDate.indexOf("12-08-2026") === 0, "preview date is DD-MM-YYYY");
assert(backupService.parseBackup("admin", "not json").code === "corrupt-json", "corrupt JSON is rejected");
assert(backupService.parseBackup("admin", JSON.stringify({ backupFormat: "other" })).code === "wrong-schema", "wrong schema is rejected");
var future = JSON.parse(exported.json); future.backupFormatVersion = 99;
assert(backupService.parseBackup("admin", JSON.stringify(future)).code === "unsupported-version", "future backup version is rejected");
future = JSON.parse(exported.json); future.appDataVersion = 99;
assert(backupService.parseBackup("admin", JSON.stringify(future)).code === "unsupported-data-version", "future data version is rejected");
assert(backupService.restoreBackup("admin", exported.backup, false).code === "confirmation-required", "confirmation is required");
assert(backupService.restoreBackup("supervisor", exported.backup, true).code === "forbidden", "non-admin restore is blocked");

function testRollback(failurePoint, errorName) {
  seedStore("Current Business");
  values["unrelated.key"] = "keep";
  var before = rawSnapshot();
  operationCount = 0; failOnOperation = failurePoint; failureName = errorName || "UnknownError";
  var result = backupService.restoreBackup("admin", exported.backup, true);
  assert(!result.ok && result.rollbackSucceeded !== false, "restore failure is reported");
  assert(rawSnapshot() === before, "failure at operation " + failurePoint + " restores exact prior data");
}

testRollback(1);
testRollback(5);
testRollback(11, "QuotaExceededError");

seedStore("Before Restore");
var success = backupService.restoreBackup("admin", exported.backup, true);
assert(success.ok, "round-trip restore succeeds");
assert(JSON.parse(values[storage.KEYS.settings]).businessName === "Export Business", "branding is restored");
assert(JSON.parse(values[storage.KEYS.cashiers]).length === 2, "users are restored");
assert(JSON.parse(values[storage.KEYS.sales]).length === 1, "sales are restored");
assert(JSON.parse(values[storage.KEYS.inventoryProducts])[0].trackInventory === true, "legacy inventory passes product migration");
assert(values[storage.KEYS.currentCart] === "[]" && !Object.prototype.hasOwnProperty.call(values, storage.KEYS.session), "temporary state is cleared after success");

console.log("Backup service tests passed.");
