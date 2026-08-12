"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var context = {
  window: { GCK: {} },
  Blob: Blob,
  Uint8Array: Uint8Array,
  atob: atob,
  String: String
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "js/services/report-pdf-service.js"), "utf8"),
  context
);

var blob = context.window.GCK.reportPdf.createPdf({
  fromDateKey: "2026-08-01",
  toDateKey: "2026-08-12",
  totalRevenue: 170,
  transactionCount: 2,
  cashTotal: 100,
  momoTotal: 70,
  bestSeller: { name: "Jollof Rice", quantity: 5 },
  productsSold: [{ name: "Jollof Rice", quantity: 5 }],
  lowStockProducts: [{ name: "Water", stockQuantity: 2, lowStockLevel: 3 }]
}, {
  businessName: "Gold Coast Kenkey",
  phone: "0123456789",
  address: "Test address",
  logo: ""
}, "Report - 01-08-2026 to 12-08-2026", "Generated: 12-08-2026 10:00 AM", function (value) {
  return "GHC " + Number(value).toFixed(2);
});

(async function () {
  var bytes = new Uint8Array(await blob.arrayBuffer());
  var text = Buffer.from(bytes).toString("latin1");
  if (!text.startsWith("%PDF-1.4")) { throw new Error("PDF header missing"); }
  if (!text.includes("xref") || !text.includes("%%EOF")) { throw new Error("PDF structure incomplete"); }
  if (!text.includes("Gold Coast Kenkey") || !text.includes("Jollof Rice")) {
    throw new Error("Report content missing from PDF");
  }
  console.log("Report PDF service tests passed.");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
