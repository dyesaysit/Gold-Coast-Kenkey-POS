"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var values = {};
var writeCount = 0;
var failOnWrite = 0;
var failureName = "UnknownError";
var localStorage = {
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  },
  setItem: function (key, value) {
    writeCount++;
    if (failOnWrite && writeCount === failOnWrite) {
      var error = new Error("simulated write failure");
      error.name = failureName;
      throw error;
    }
    values[key] = String(value);
  },
  removeItem: function (key) { delete values[key]; }
};

var context = {
  window: { GCK: { seedData: {} } },
  localStorage: localStorage,
  console: { warn: function () {}, error: function () {} },
  JSON: JSON,
  Date: Date,
  Math: Math,
  Number: Number,
  Object: Object,
  Array: Array,
  String: String
};
vm.createContext(context);
var storageFilename = path.join(__dirname, "..", "js/services/storage-service.js");
vm.runInContext(fs.readFileSync(storageFilename, "utf8"), context, { filename: storageFilename });
var storage = context.window.GCK.storage;

function assertEqual(actual, expected, message) {
  if (actual !== expected) { throw new Error(message + ": expected " + expected + ", received " + actual); }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}

function resetStore(failingWrite, errorName) {
  values = {
    "gckpos.inventoryProducts": JSON.stringify([{ id: "water", name: "Water", stockQuantity: 5, trackInventory: true }]),
    "gckpos.sales": JSON.stringify([{ id: "previous-sale", status: "completed" }]),
    "gckpos.currentCart": JSON.stringify([{ id: "cart-water", productId: "water", quantity: 2 }])
  };
  writeCount = 0;
  failOnWrite = failingWrite || 0;
  failureName = errorName || "UnknownError";
}

function snapshots() {
  return {
    inventory: values["gckpos.inventoryProducts"],
    sales: values["gckpos.sales"],
    cart: values["gckpos.currentCart"]
  };
}

function testSale() {
  return {
    id: "new-sale",
    status: "completed",
    items: [{ productId: "water", productName: "Water", quantity: 2, trackInventory: true }]
  };
}

function testRollback(failingWrite, expectedStage) {
  resetStore(failingWrite);
  var before = snapshots();
  var result = storage.completeSale(testSale());
  var after = snapshots();
  assertEqual(result.success, false, expectedStage + " failure result");
  assertEqual(result.stage, expectedStage, expectedStage + " failure stage");
  assertEqual(result.rollbackSuccessful, true, expectedStage + " rollback result");
  assertEqual(after.inventory, before.inventory, expectedStage + " restores inventory");
  assertEqual(after.sales, before.sales, expectedStage + " restores sales");
  assertEqual(after.cart, before.cart, expectedStage + " restores cart");
}

testRollback(1, "inventory");
testRollback(2, "sale");
testRollback(3, "cart");

resetStore(2, "QuotaExceededError");
var capacityResult = storage.completeSale(testSale());
assertEqual(capacityResult.code, "storage_capacity", "capacity failure code");
assert(capacityResult.message.indexOf("storage is full") !== -1, "capacity failure message");

resetStore(0);
var success = storage.completeSale(testSale());
assertEqual(success.success, true, "successful sale result");
assertEqual(JSON.parse(values["gckpos.inventoryProducts"])[0].stockQuantity, 3, "successful stock reduction");
assertEqual(JSON.parse(values["gckpos.sales"]).length, 2, "successful sale append");
assertEqual(JSON.parse(values["gckpos.currentCart"]).length, 0, "successful cart clear");

var currentSettings = {
  businessName: "Current Business",
  shortName: "CUR",
  logo: "current-logo",
  phone: "000",
  address: "Current Address",
  receiptFooterNote: "Current footer",
  receiptExtraInfo: "Current info",
  receiptPaperWidth: "80mm"
};
assertEqual(storage.getReceiptSettings({ id: "old" }, currentSettings), currentSettings, "old receipt settings fallback");

var savedSnapshot = storage.createReceiptSettingsSnapshot({
  businessName: "Historical Business",
  shortName: "HIS",
  logo: "historical-logo",
  phone: "111",
  address: "Historical Address",
  receiptFooterNote: "Historical footer",
  receiptExtraInfo: "Historical info",
  receiptPaperWidth: "58mm"
});
assertEqual(Object.keys(savedSnapshot).sort().join(","), [
  "address", "businessName", "extraReceiptInfo", "logo", "phone",
  "receiptFooter", "receiptPaperWidth", "shortName"
].sort().join(","), "receipt snapshot contains only required settings");
var historical = storage.getReceiptSettings({ receiptSettings: savedSnapshot }, currentSettings);
assertEqual(historical.businessName, "Historical Business", "historical business name");
assertEqual(historical.logo, "historical-logo", "historical logo");
assertEqual(historical.receiptFooterNote, "Historical footer", "historical footer");
assertEqual(historical.receiptExtraInfo, "Historical info", "historical extra info");
assertEqual(historical.receiptPaperWidth, "58mm", "historical paper width");

var appSource = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
assert(appSource.indexOf("if (isCompleting)") !== -1, "duplicate submission guard remains");
assert(appSource.indexOf("elements.checkoutComplete.disabled = true") !== -1, "checkout button locks during save");

console.log("Checkout reliability tests passed.");
