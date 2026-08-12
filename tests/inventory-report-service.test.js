"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var products = [
  { id: "water", name: "Water", trackInventory: true, productType: "simple", stockQuantity: 10, lowStockLevel: 3 },
  { id: "malt", name: "Malt", trackInventory: true, productType: "simple", stockQuantity: 3, lowStockLevel: 3 },
  { id: "cola", name: "Cola", trackInventory: true, productType: "simple", stockQuantity: 0, lowStockLevel: 2 },
  { id: "meal", name: "Kenkey Meal", trackInventory: false, productType: "configured-meal", stockQuantity: 20, lowStockLevel: 2 },
  { id: "bad-meal", name: "Bad Meal", trackInventory: true, productType: "configured-meal", stockQuantity: 20, lowStockLevel: 2 },
  { id: "legacy", name: "Legacy Product", itemType: "inventory-product", stockQuantity: 20, lowStockLevel: 2 },
  { id: "other", name: "Other", trackInventory: false, productType: "simple", stockQuantity: 20, lowStockLevel: 2 }
];

var context = {
  window: { GCK: { storage: { getInventoryProducts: function () { return products; } } } },
  console: console,
  Number: Number,
  Math: Math,
  String: String,
  Array: Array
};
vm.createContext(context);

function load(relativePath) {
  var filename = path.join(__dirname, "..", relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
}

function equal(actual, expected, message) {
  if (actual !== expected) { throw new Error(message + ": expected " + expected + ", received " + actual); }
}

load("js/services/inventory-report-service.js");
load("js/services/auth-service.js");
var report = context.window.GCK.inventoryReport;
var auth = context.window.GCK.auth;
var summary = report.getSummary();

equal(summary.totalProducts, 3, "strictly tracked product count");
equal(summary.totalUnits, 13, "total units");
equal(summary.lowStockCount, 1, "low-stock count");
equal(summary.outOfStockCount, 1, "out-of-stock count");
equal(summary.products.filter(function (p) { return p.id === "malt"; })[0].status, "low", "threshold equality is low");
equal(summary.products.filter(function (p) { return p.id === "cola"; })[0].status, "out", "zero stock is out");
equal(report.filterProducts(summary.products, "all", "").length, 3, "All filter");
equal(report.filterProducts(summary.products, "low", "").length, 1, "Low Stock filter");
equal(report.filterProducts(summary.products, "out", "").length, 1, "Out of Stock filter");
equal(report.filterProducts(summary.products, "all", "wat")[0].name, "Water", "name search");
equal(report.filterProducts(summary.products, "low", "malt").length, 1, "combined matching search and status");
equal(report.filterProducts(summary.products, "out", "malt").length, 0, "combined nonmatching search and status");
equal(auth.canAccess("cashier", "inventory"), false, "cashier blocked");
equal(auth.canAccess("supervisor", "inventory"), true, "supervisor allowed");
equal(auth.canAccess("admin", "inventory"), true, "admin allowed");

console.log("Inventory Report service tests passed.");
