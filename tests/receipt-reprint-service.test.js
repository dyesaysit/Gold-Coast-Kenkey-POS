"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var sales = [];
var context = {
  window: { GCK: { storage: { getSales: function () { return sales; } } } },
  console: console,
  Date: Date,
  Number: Number,
  String: String,
  Array: Array,
  Math: Math,
  isNaN: isNaN
};
vm.createContext(context);

function load(rel) {
  var file = path.join(__dirname, "..", rel);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
load("js/services/receipt-reprint-service.js");
var reprint = context.window.GCK.receiptReprint;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + ": expected " + expected + ", received " + actual);
  }
}
function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}

function sale(receipt, cashierId, opts) {
  opts = opts || {};
  return {
    id: "sale-" + receipt,
    receiptNumber: receipt,
    createdAt: opts.createdAt || "2026-08-15T10:00:00.000Z",
    status: opts.status || "completed",
    total: opts.total || 20,
    cashier: { id: cashierId, name: cashierId },
    payment: { method: opts.method || "cash", reference: opts.reference }
  };
}

var CASHIER = { id: "user-cashier", role: "cashier" };
var OTHER_CASHIER = { id: "user-cashier-2", role: "cashier" };
var SUPERVISOR = { id: "user-supervisor", role: "supervisor" };
var ADMIN = { id: "user-admin", role: "admin" };

sales = [
  sale("GCK-20260815-0001", "user-cashier"),
  sale("GCK-20260815-0002", "user-cashier-2"),
  sale("GCK-20260815-0003", "user-cashier", { method: "momo", reference: "MOMO-REF-77" }),
  sale("GCK-20260814-0009", "user-cashier", { createdAt: "2026-08-14T10:00:00.000Z" })
];

// --- Successful lookup / reprint ---
var found = reprint.findSale("GCK-20260815-0001", CASHIER);
assertEqual(found.status, "found", "cashier finds own receipt");
assertEqual(found.sale.receiptNumber, "GCK-20260815-0001", "returns the right sale");

// case-insensitive + trims whitespace
assertEqual(reprint.findSale("  gck-20260815-0001  ", CASHIER).status, "found", "trim + case-insensitive lookup");

// lookup by MoMo reference
var byRef = reprint.findSale("momo-ref-77", CASHIER);
assertEqual(byRef.status, "found", "cashier finds own sale by MoMo reference");
assertEqual(byRef.sale.receiptNumber, "GCK-20260815-0003", "reference maps to the right sale");

// --- Empty search ---
assertEqual(reprint.findSale("", CASHIER).status, "empty", "empty query");
assertEqual(reprint.findSale("   ", CASHIER).status, "empty", "whitespace-only query");
assertEqual(reprint.findSale(null, CASHIER).status, "empty", "null query");

// --- Not found ---
assertEqual(reprint.findSale("GCK-20260815-9999", CASHIER).status, "not-found", "unknown receipt");
// reference-safe: partial does not match
assertEqual(reprint.findSale("0001", CASHIER).status, "not-found", "partial receipt number does not match");

// --- Permission isolation ---
// cashier cannot reach another cashier's receipt (exists but not visible)
assertEqual(reprint.findSale("GCK-20260815-0002", CASHIER).status, "not-found", "cashier blocked from other cashier receipt");
assertEqual(reprint.findSale("GCK-20260815-0001", OTHER_CASHIER).status, "not-found", "other cashier blocked from this receipt");
// supervisor and admin can reach any receipt
assertEqual(reprint.findSale("GCK-20260815-0002", SUPERVISOR).status, "found", "supervisor can reach any receipt");
assertEqual(reprint.findSale("GCK-20260815-0001", ADMIN).status, "found", "admin can reach any receipt");
// unauthenticated user sees nothing
assertEqual(reprint.findSale("GCK-20260815-0001", null).status, "not-found", "no user reaches nothing");

// --- Duplicate / reference-safe: most recent wins ---
sales = [
  sale("GCK-DUP", "user-cashier", { createdAt: "2026-08-15T08:00:00.000Z" }),
  sale("GCK-DUP", "user-cashier", { createdAt: "2026-08-15T09:30:00.000Z" })
];
var dup = reprint.findSale("GCK-DUP", CASHIER);
assertEqual(dup.status, "found", "duplicate lookup succeeds");
assertEqual(dup.duplicateCount, 2, "duplicate count reported");
assertEqual(dup.sale.createdAt, "2026-08-15T09:30:00.000Z", "most recent duplicate returned");

// --- Recent sales: today-only + own-only ---
sales = [
  sale("GCK-20260815-0001", "user-cashier", { createdAt: "2026-08-15T09:00:00.000Z" }),
  sale("GCK-20260815-0005", "user-cashier", { createdAt: "2026-08-15T11:00:00.000Z" }),
  sale("GCK-20260814-0009", "user-cashier", { createdAt: "2026-08-14T10:00:00.000Z" }),
  sale("GCK-20260815-0002", "user-cashier-2", { createdAt: "2026-08-15T12:00:00.000Z" })
];
var today = new Date("2026-08-15T15:00:00.000Z");
var recent = reprint.getRecentSales(CASHIER, true, 8, today);
assertEqual(recent.length, 2, "cashier sees only own today sales");
assertEqual(recent[0].receiptNumber, "GCK-20260815-0005", "recent sales are most-recent first");
assert(recent.every(function (s) { return s.cashier.id === "user-cashier"; }), "no other cashier in recent list");
// supervisor sees all today sales
assertEqual(reprint.getRecentSales(SUPERVISOR, true, 8, today).length, 3, "supervisor sees all today sales");

console.log("Receipt reprint service tests passed.");
