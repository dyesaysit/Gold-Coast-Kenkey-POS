"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var context = { window: { GCK: {} } };
vm.createContext(context);
var filename = path.join(__dirname, "..", "js/services/pos-catalog-service.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
var filter = context.window.GCK.posCatalog.getVisibleProducts;
var meals = [
  { id: "jollof", name: "Jollof Rice", categoryId: "rice", active: true, popular: true },
  { id: "waakye", name: "Waakye", categoryId: "rice", active: true }
];
var products = [
  { id: "water", name: "Bottle Water", categoryId: "drinks", active: true, popular: true },
  { id: "malt", name: "Malt", categoryId: "drinks", active: true },
  { id: "hidden", name: "Hidden", categoryId: "drinks", active: false, popular: true }
];

function ids(result) { return result.map(function (item) { return item.id; }).join(","); }
function assertEqual(actual, expected, message) { if (actual !== expected) { throw new Error(message + ": " + actual); } }

assertEqual(ids(filter(meals, products, "all", "Jollof Rice")), "jollof", "exact search");
assertEqual(ids(filter(meals, products, "all", "llo")), "jollof", "partial search");
assertEqual(ids(filter(meals, products, "all", "bOtTlE")), "water", "case-insensitive search");
assertEqual(ids(filter(meals, products, "drinks", "wa")), "water", "category and search combine");
assertEqual(ids(filter(meals, products, "popular", "")), "jollof,water", "Popular uses explicit true flag");
assertEqual(ids(filter(meals, products, "popular", "malt")), "", "missing popular flag is backward compatible");
assertEqual(ids(filter(meals, products, "all", "")), "jollof,waakye,water,malt", "inactive products remain hidden");

console.log("POS catalogue filtering tests passed.");
