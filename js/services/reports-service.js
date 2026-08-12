/*
 * reports-service.js
 * Read-only daily reporting logic. Historical totals and item names come only
 * from completed sale snapshots; current inventory is used only for low stock.
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var money = global.GCK.money;

  function toDateKey(dateOrString) {
    var date = dateOrString instanceof Date ? dateOrString : new Date(dateOrString);
    if (isNaN(date.getTime())) { return ""; }
    var year = date.getFullYear();
    var month = ("0" + (date.getMonth() + 1)).slice(-2);
    var day = ("0" + date.getDate()).slice(-2);
    return year + "-" + month + "-" + day;
  }

  function todayKey() {
    return toDateKey(new Date());
  }

  function formatDateKey(dateKey) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    return match ? match[3] + "-" + match[2] + "-" + match[1] : "";
  }

  function displayDateToKey(displayDate) {
    var match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(displayDate || "").trim());
    if (!match) { return ""; }
    var key = match[3] + "-" + match[2] + "-" + match[1];
    return toDateKey(key + "T00:00:00") === key ? key : "";
  }

  function formatDateTime(dateOrString) {
    var date = dateOrString instanceof Date ? dateOrString : new Date(dateOrString);
    if (isNaN(date.getTime())) { return ""; }
    return formatDateKey(toDateKey(date)) + " " + date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getLowStockProducts() {
    return storage.getInventoryProducts().filter(function (product) {
      var tracked = typeof product.trackInventory === "boolean"
        ? product.trackInventory
        : product.itemType === "inventory-product";
      var stock = Number(product.stockQuantity);
      var threshold = Number(product.lowStockLevel);
      return tracked && isFinite(stock) && isFinite(threshold) && stock <= threshold;
    }).sort(function (a, b) {
      return Number(a.stockQuantity) - Number(b.stockQuantity);
    });
  }

  function getSalesSummary(fromDateKey, throughDateKey) {
    var wantedFrom = fromDateKey || todayKey();
    var wantedTo = throughDateKey || wantedFrom;
    var sales = storage.getSales();
    var revenue = 0;
    var cashTotal = 0;
    var momoTotal = 0;
    var transactionCount = 0;
    var products = {};

    for (var i = 0; i < sales.length; i++) {
      var sale = sales[i];
      var saleDateKey = sale ? toDateKey(sale.createdAt) : "";
      if (!sale || sale.status !== "completed" || saleDateKey < wantedFrom || saleDateKey > wantedTo) {
        continue;
      }

      var saleTotal = money.roundMoney(sale.total);
      transactionCount += 1;
      revenue += saleTotal;
      if (sale.payment && sale.payment.method === "cash") {
        cashTotal += saleTotal;
      } else if (sale.payment && sale.payment.method === "momo") {
        momoTotal += saleTotal;
      }

      var items = Array.isArray(sale.items) ? sale.items : [];
      for (var j = 0; j < items.length; j++) {
        var item = items[j] || {};
        var name = item.productName || "Unknown item";
        var productKey = item.productId || "name:" + name;
        var quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) { continue; }
        if (!products[productKey]) {
          products[productKey] = { productId: item.productId || "", name: name, quantity: 0 };
        }
        products[productKey].quantity += quantity;
      }
    }

    var productsSold = Object.keys(products).map(function (key) {
      return products[key];
    }).sort(function (a, b) {
      if (b.quantity !== a.quantity) { return b.quantity - a.quantity; }
      return a.name.localeCompare(b.name);
    });

    return {
      fromDateKey: wantedFrom,
      toDateKey: wantedTo,
      totalRevenue: money.roundMoney(revenue),
      transactionCount: transactionCount,
      cashTotal: money.roundMoney(cashTotal),
      momoTotal: money.roundMoney(momoTotal),
      productsSold: productsSold,
      bestSeller: productsSold.length ? productsSold[0] : null,
      lowStockProducts: getLowStockProducts()
    };
  }

  function getDailySalesSummary(dateKey) {
    return getSalesSummary(dateKey, dateKey);
  }

  global.GCK = global.GCK || {};
  global.GCK.reports = {
    toDateKey: toDateKey,
    todayKey: todayKey,
    formatDateKey: formatDateKey,
    displayDateToKey: displayDateToKey,
    formatDateTime: formatDateTime,
    getSalesSummary: getSalesSummary,
    getDailySalesSummary: getDailySalesSummary
  };
})(window);
