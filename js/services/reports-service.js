/*
 * reports-service.js
 * Member 3 (feature/inventory-reports): the daily sales report.
 *
 * Reads COMPLETED sale snapshots from storage and summarises one day. All money
 * math goes through GCK.money, and low-stock comes from GCK.inventory, so no
 * logic is duplicated (AGENTS.md rules 4.3 and 4.4).
 *
 * It uses completed snapshots only (prompt rule 14) and excludes other dates
 * (rule 15). It never recalculates prices from the current menu, so a later
 * price change cannot change a past day's totals (business rules 7 and 8).
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var money = global.GCK.money;
  var inventory = global.GCK.inventory;

  /**
   * Turn a Date (or ISO string) into a local "YYYY-MM-DD" key. We compare these
   * keys so every sale from the same calendar day groups together.
   * Note: uses the browser's local date. Ghana is UTC+0, so local matches UTC.
   */
  function toDateKey(dateOrString) {
    var date = (dateOrString instanceof Date) ? dateOrString : new Date(dateOrString);
    if (isNaN(date.getTime())) {
      return ""; // unreadable date: never matches a real day, so it is skipped
    }
    var year = date.getFullYear();
    var month = ("0" + (date.getMonth() + 1)).slice(-2); // getMonth() is 0-based
    var day = ("0" + date.getDate()).slice(-2);
    return year + "-" + month + "-" + day;
  }

  /** Today's date key in the cashier's local time. */
  function todayKey() {
    return toDateKey(new Date());
  }

  /**
   * Summarise all completed sales for one day.
   * @param {string} [dateKey] - "YYYY-MM-DD". Defaults to today.
   * @returns {Object} {
   *   dateKey, salesCount, totalSales, totalCashReceived,
   *   unitsByProduct: [{ productId, name, units }] (most sold first),
   *   bestSeller: { productId, name, units } | null,
   *   lowStockProducts: [ ...products ]
   * }
   */
  function getDailySalesSummary(dateKey) {
    var wanted = dateKey || todayKey();
    var sales = storage.getSales();

    var salesCount = 0;
    var totalSales = 0;
    var totalCashReceived = 0;
    var unitsMap = {}; // productId -> { productId, name, units }

    for (var i = 0; i < sales.length; i++) {
      var sale = sales[i];

      // Only completed sales, and only the requested date (rules 14 and 15).
      if (!sale || sale.status !== "completed") {
        continue;
      }
      if (toDateKey(sale.createdAt) !== wanted) {
        continue;
      }

      salesCount += 1;
      totalSales += Number(sale.total) || 0;
      if (sale.payment) {
        totalCashReceived += Number(sale.payment.amountPaid) || 0;
      }

      // Count units per product across every line (meals and drinks alike),
      // using the names stored in the snapshot, not the current menu.
      var items = Array.isArray(sale.items) ? sale.items : [];
      for (var j = 0; j < items.length; j++) {
        var line = items[j];
        var id = line.productId;
        var quantity = Number(line.quantity) || 0;
        if (!unitsMap[id]) {
          unitsMap[id] = { productId: id, name: line.productName || id, units: 0 };
        }
        unitsMap[id].units += quantity;
      }
    }

    // Turn the units map into a list sorted from most sold to least sold.
    var unitsByProduct = [];
    for (var key in unitsMap) {
      if (Object.prototype.hasOwnProperty.call(unitsMap, key)) {
        unitsByProduct.push(unitsMap[key]);
      }
    }
    unitsByProduct.sort(function (a, b) {
      return b.units - a.units;
    });

    var bestSeller = unitsByProduct.length > 0 ? unitsByProduct[0] : null;

    return {
      dateKey: wanted,
      salesCount: salesCount,
      totalSales: money.roundMoney(totalSales),
      totalCashReceived: money.roundMoney(totalCashReceived),
      unitsByProduct: unitsByProduct,
      bestSeller: bestSeller,
      lowStockProducts: inventory.getLowStockProducts()
    };
  }

  global.GCK = global.GCK || {};
  global.GCK.reports = {
    toDateKey: toDateKey,
    todayKey: todayKey,
    getDailySalesSummary: getDailySalesSummary
  };
})(window);
