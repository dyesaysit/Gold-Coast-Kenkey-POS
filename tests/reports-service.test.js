"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var sales = [];
var inventoryProducts = [];
var context = {
  window: {
    GCK: {
      storage: {
        getSales: function () { return sales; },
        getInventoryProducts: function () { return inventoryProducts; },
        getCashiers: function () { return []; }
      },
      money: {
        roundMoney: function (value) {
          var amount = Number(value);
          if (!isFinite(amount)) { amount = 0; }
          return Math.round((amount + Number.EPSILON) * 100) / 100;
        }
      }
    }
  },
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  Object: Object,
  Array: Array,
  isFinite: isFinite,
  isNaN: isNaN
};
vm.createContext(context);

function load(relativePath) {
  var filename = path.join(__dirname, "..", relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
}

load("js/services/reports-service.js");
load("js/services/auth-service.js");

var reports = context.window.GCK.reports;
var auth = context.window.GCK.auth;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + ": expected " + expected + ", received " + actual);
  }
}

function item(id, name, quantity) {
  return { productId: id, productName: name, quantity: quantity };
}

function sale(id, createdAt, method, total, items, status) {
  return {
    id: id,
    createdAt: createdAt,
    status: status || "completed",
    total: total,
    payment: { method: method, amountPaid: method === "cash" ? total + 20 : total },
    items: items
  };
}

var reportDate = "2026-08-12";

assertEqual(reports.formatDateKey(reportDate), "12-08-2026", "visible date format");
assertEqual(reports.displayDateToKey("12-08-2026"), reportDate, "display date parsing");
assertEqual(reports.displayDateToKey("31-02-2026"), "", "invalid display date rejected");

// Zero-sales day and current low-stock calculation.
inventoryProducts = [
  { id: "water", name: "Water", itemType: "inventory-product", stockQuantity: 2, lowStockLevel: 3 },
  { id: "malt", name: "Malt", itemType: "inventory-product", stockQuantity: 8, lowStockLevel: 3 },
  { id: "meal", name: "Meal", itemType: "configured-meal", stockQuantity: 0, lowStockLevel: 3 }
];
var summary = reports.getDailySalesSummary(reportDate);
assertEqual(summary.transactionCount, 0, "zero-sales transaction count");
assertEqual(summary.totalRevenue, 0, "zero-sales revenue");
assertEqual(summary.bestSeller, null, "zero-sales best seller");
assertEqual(summary.lowStockProducts.length, 1, "low-stock products");
assertEqual(summary.lowStockProducts[0].name, "Water", "low-stock name");

// Cash-only: revenue uses the sale snapshot total, not cash tendered.
sales = [sale("cash-1", "2026-08-12T09:00:00.000Z", "cash", 80, [item("water", "Water", 2)])];
summary = reports.getDailySalesSummary(reportDate);
assertEqual(summary.totalRevenue, 80, "cash-only revenue");
assertEqual(summary.cashTotal, 80, "cash-only cash total");
assertEqual(summary.momoTotal, 0, "cash-only MoMo total");

// MoMo-only.
sales = [sale("momo-1", "2026-08-12T10:00:00.000Z", "momo", 45.5, [item("malt", "Malt", 1)])];
summary = reports.getDailySalesSummary(reportDate);
assertEqual(summary.totalRevenue, 45.5, "MoMo-only revenue");
assertEqual(summary.cashTotal, 0, "MoMo-only cash total");
assertEqual(summary.momoTotal, 45.5, "MoMo-only total");

// Mixed payments, multiple quantities, configured meals, date/status filters,
// and deterministic best seller.
sales = [
  sale("cash-2", "2026-08-12T11:00:00.000Z", "cash", 100, [
    item("jollof", "Jollof Rice", 2),
    item("water", "Water", 1)
  ]),
  sale("momo-2", "2026-08-12T12:00:00.000Z", "momo", 70, [
    item("jollof", "Jollof Rice", 3),
    item("kenkey", "Kenkey Meal", 2)
  ]),
  sale("other-date", "2026-08-11T12:00:00.000Z", "cash", 999, [item("water", "Water", 99)]),
  sale("incomplete", "2026-08-12T13:00:00.000Z", "cash", 500, [item("water", "Water", 50)], "pending"),
  sale("cancelled", "2026-08-12T14:00:00.000Z", "momo", 500, [item("water", "Water", 50)], "cancelled")
];
summary = reports.getDailySalesSummary(reportDate);
assertEqual(summary.transactionCount, 2, "mixed completed transaction count");
assertEqual(summary.totalRevenue, 170, "mixed revenue");
assertEqual(summary.cashTotal, 100, "mixed cash total");
assertEqual(summary.momoTotal, 70, "mixed MoMo total");
assertEqual(summary.productsSold.length, 3, "products and meals sold count");
assertEqual(summary.bestSeller.name, "Jollof Rice", "configured-meal best seller");
assertEqual(summary.bestSeller.quantity, 5, "best-seller quantity");

// Inclusive multi-day range: both boundaries count, outside dates and
// incomplete sales do not, and aggregation spans all included days.
sales = [
  sale("range-start", "2026-08-01T08:00:00.000Z", "cash", 40, [item("jollof", "Jollof Rice", 2)]),
  sale("range-middle", "2026-08-06T08:00:00.000Z", "momo", 60, [item("water", "Water", 4)]),
  sale("range-end", "2026-08-12T08:00:00.000Z", "cash", 80, [item("jollof", "Jollof Rice", 3)]),
  sale("before-range", "2026-07-31T08:00:00.000Z", "cash", 900, [item("water", "Water", 90)]),
  sale("after-range", "2026-08-13T08:00:00.000Z", "momo", 900, [item("water", "Water", 90)]),
  sale("range-pending", "2026-08-05T08:00:00.000Z", "cash", 900, [item("water", "Water", 90)], "pending")
];
summary = reports.getSalesSummary("2026-08-01", "2026-08-12");
assertEqual(summary.transactionCount, 3, "range completed transaction count");
assertEqual(summary.totalRevenue, 180, "range revenue with inclusive boundaries");
assertEqual(summary.cashTotal, 120, "range cash total");
assertEqual(summary.momoTotal, 60, "range MoMo total");
assertEqual(summary.bestSeller.name, "Jollof Rice", "range best seller");
assertEqual(summary.bestSeller.quantity, 5, "range best-seller quantity");

sales = [];
summary = reports.getSalesSummary("2026-08-01", "2026-08-12");
assertEqual(summary.transactionCount, 0, "zero-sales range count");
assertEqual(summary.totalRevenue, 0, "zero-sales range revenue");

// Existing role access is the source of truth for the Reports page.
assertEqual(auth.canAccess("cashier", "reports"), false, "cashier Reports access");
assertEqual(auth.canAccess("supervisor", "reports"), true, "supervisor Reports access");
assertEqual(auth.canAccess("admin", "reports"), true, "admin Reports access");

console.log("Reports service tests passed.");
