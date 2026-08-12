"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");
var sales = [];
var context = { window: { GCK: { storage: { getSales: function () { return sales; }, getCashiers: function () { return []; }, saveSession: function () { return true; }, getSession: function () { return null; }, clearSession: function () { return true; } }, money: { roundMoney: function (value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; } } } }, console: console, Date: Date, Number: Number, String: String, Array: Array, Math: Math, isNaN: isNaN };
vm.createContext(context);
var filename = path.join(__dirname, "..", "js/services/sales-history-service.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
var authFilename = path.join(__dirname, "..", "js/services/auth-service.js");
vm.runInContext(fs.readFileSync(authFilename, "utf8"), context, { filename: authFilename });
var history = context.window.GCK.salesHistory;
var auth = context.window.GCK.auth;

function assertEqual(actual, expected, message) { if (actual !== expected) { throw new Error(message + ": expected " + expected + ", received " + actual); } }
function sale(id, date, method, total, status, cashier, itemName) { return { id: id, receiptNumber: "GCK-" + id, createdAt: date, status: status, total: total, cashier: { name: cashier }, payment: { method: method }, items: [{ productName: itemName, quantity: 1 }] }; }

sales = [
  sale("001", "2026-08-10T09:00:00.000Z", "cash", 20, "completed", "Ama", "Kenkey"),
  sale("002", "2026-08-12T10:00:00.000Z", "momo", 45.5, "completed", "Kojo", "Jollof Rice"),
  sale("003", "2026-08-11T10:00:00.000Z", "cash", 99, "cancelled", "Ama", "Water")
];
var result = history.getHistory({});
assertEqual(result.transactionCount, 2, "completed sales only");
assertEqual(result.sales[0].id, "002", "newest sale first");
assertEqual(result.totalRevenue, 65.5, "snapshot totals summed");
assertEqual(history.getHistory({ query: "GCK-001" }).sales[0].id, "001", "receipt search");
assertEqual(history.getHistory({ cashier: "Kojo" }).sales[0].id, "002", "cashier filter");
assertEqual(history.getHistory({ paymentMethod: "cash" }).transactionCount, 1, "payment filter");
assertEqual(history.getHistory({ fromDate: "2026-08-11", toDate: "2026-08-12" }).sales[0].id, "002", "inclusive date filter");
assertEqual(history.getHistory({ query: "002", cashier: "Kojo", paymentMethod: "momo", fromDate: "2026-08-12", toDate: "2026-08-12" }).transactionCount, 1, "combined filters");
// Sale snapshots are returned unchanged; no current product price participates.
sales = [{
  id: "snapshot",
  receiptNumber: "GCK-SNAPSHOT",
  createdAt: "2026-08-12T14:35:00.000Z",
  status: "completed",
  total: 72,
  cashier: { name: "Ama" },
  payment: { method: "cash", amountPaid: 100, change: 28 },
  items: [{ productName: "Jollof Rice", portion: { name: "Regular", price: 42 }, protein: { name: "Chicken Leg" }, extras: [{ name: "Extra Rice", quantity: 2, price: 5 }], quantity: 1, unitTotal: 72, lineTotal: 72 }]
}];
var snapshotResult = history.getHistory({});
assertEqual(snapshotResult.sales[0].total, 72, "historical total stays saved");
assertEqual(snapshotResult.sales[0].items[0].portion.name, "Regular", "portion snapshot preserved");
assertEqual(snapshotResult.sales[0].items[0].extras[0].quantity, 2, "extra quantity snapshot preserved");

assertEqual(auth.canAccess("cashier", "sales-history"), false, "Cashier blocked");
assertEqual(auth.canAccess("supervisor", "sales-history"), true, "Supervisor allowed");
assertEqual(auth.canAccess("admin", "sales-history"), true, "Admin allowed");
console.log("Sales history snapshot and access tests passed.");
