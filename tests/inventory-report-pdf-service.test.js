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
  fs.readFileSync(path.join(__dirname, "..", "js/services/inventory-report-pdf-service.js"), "utf8"),
  context
);

var summary = { totalProducts: 2, totalUnits: 3, lowStockCount: 1, outOfStockCount: 1 };
var filtered = [
  { name: "Malt", stockQuantity: 3, lowStockLevel: 3, status: "low" },
  { name: "Cola", stockQuantity: 0, lowStockLevel: 2, status: "out" }
];
var blob = context.window.GCK.inventoryReportPdf.createPdf(
  summary,
  filtered,
  { businessName: "Gold Coast Kenkey", phone: "0123456789", address: "Test address", logo: "" },
  "Generated: 12-08-2026 10:00 AM",
  "Filter: Low Stock | Search: malt"
);

(async function () {
  var pdfText = Buffer.from(new Uint8Array(await blob.arrayBuffer())).toString("latin1");
  if (!pdfText.startsWith("%PDF-1.4") || !pdfText.includes("%%EOF")) {
    throw new Error("Inventory PDF structure is incomplete");
  }
  if (!pdfText.includes("Inventory Report") || !pdfText.includes("Gold Coast Kenkey") || !pdfText.includes("Malt")) {
    throw new Error("Inventory PDF content is missing");
  }
  console.log("Inventory Report PDF service tests passed.");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
