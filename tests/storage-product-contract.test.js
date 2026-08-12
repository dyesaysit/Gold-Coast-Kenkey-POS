"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");
var values = {};
var localStorage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
  setItem: function (key, value) { values[key] = String(value); },
  removeItem: function (key) { delete values[key]; }
};
localStorage.setItem("gckpos.inventoryProducts", JSON.stringify([
  {
    id: "legacy", name: "Legacy", stockQuantity: 4, lowStockLevel: 2,
    sellingPrice: 12.5, image: "images/legacy.jpg", active: false
  },
  {
    id: "disabled", name: "Disabled", trackInventory: false,
    productType: "custom-simple", stockQuantity: 7, lowStockLevel: 2
  }
]));
localStorage.setItem("gckpos.menuItems", JSON.stringify([
  {
    id: "meal", name: "Meal", image: "images/meal.jpg", active: true,
    portionIds: ["portion-regular"], configuration: { proteinRequired: true }
  },
  { id: "custom-meal", name: "Custom Meal", trackInventory: true, productType: "special-meal" }
]));

var context = {
  window: { GCK: { seedData: {
    settings: {}, cashiers: [], categories: [], menuItems: [], portions: [],
    proteins: [], extras: [], inventoryProducts: []
  } } },
  localStorage: localStorage,
  console: console,
  JSON: JSON,
  Date: Date,
  Math: Math,
  Number: Number
};
vm.createContext(context);
var filename = path.join(__dirname, "..", "js/services/storage-service.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
context.window.GCK.storage.seedInitialData();

var inventory = context.window.GCK.storage.getInventoryProducts();
var meals = context.window.GCK.storage.getMenuItems();
if (inventory[0].trackInventory !== true || inventory[0].productType !== "simple") {
  throw new Error("Legacy inventory product was not migrated to the explicit contract");
}
if (inventory[1].trackInventory !== false) {
  throw new Error("Explicit non-tracked choice was overwritten");
}
if (inventory[1].productType !== "custom-simple") {
  throw new Error("Existing inventory productType was overwritten");
}
if (inventory[0].stockQuantity !== 4 || inventory[0].sellingPrice !== 12.5 ||
    inventory[0].image !== "images/legacy.jpg" || inventory[0].active !== false) {
  throw new Error("Inventory product data changed during migration");
}
if (meals[0].trackInventory !== false || meals[0].productType !== "configured-meal") {
  throw new Error("Configured meal contract was not migrated safely");
}
if (meals[0].portionIds[0] !== "portion-regular" ||
    meals[0].configuration.proteinRequired !== true ||
    meals[0].image !== "images/meal.jpg" || meals[0].active !== true) {
  throw new Error("Configured meal data changed during migration");
}
if (meals[1].trackInventory !== true || meals[1].productType !== "special-meal") {
  throw new Error("Existing configured-meal contract values were overwritten");
}

var afterFirstRun = JSON.stringify({
  inventory: context.window.GCK.storage.getInventoryProducts(),
  meals: context.window.GCK.storage.getMenuItems()
});
context.window.GCK.storage.seedInitialData();
var afterSecondRun = JSON.stringify({
  inventory: context.window.GCK.storage.getInventoryProducts(),
  meals: context.window.GCK.storage.getMenuItems()
});
if (afterSecondRun !== afterFirstRun) {
  throw new Error("Migration is not safe to run repeatedly");
}
if (context.window.GCK.storage.getInventoryProducts().length !== 2 ||
    context.window.GCK.storage.getMenuItems().length !== 2) {
  throw new Error("Migration duplicated or removed products");
}
console.log("Storage product-contract migration tests passed.");
