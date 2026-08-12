/* Sales History business logic. Keeps filtering and totals out of the UI. */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var money = global.GCK.money;

  function dateKey(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) { return ""; }
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function getHistory(filters) {
    filters = filters || {};
    var query = String(filters.query || "").trim().toLowerCase();
    var fromDate = String(filters.fromDate || "");
    var toDate = String(filters.toDate || "");
    var paymentMethod = String(filters.paymentMethod || "all");
    var cashier = String(filters.cashier || "all");
    var sales = storage.getSales();
    if (!Array.isArray(sales)) { sales = []; }

    var filtered = sales.filter(function (sale) {
      if (!sale || sale.status !== "completed") { return false; }
      var saleDate = dateKey(sale.createdAt);
      if (!saleDate || (fromDate && saleDate < fromDate) || (toDate && saleDate > toDate)) { return false; }
      var method = sale.payment && sale.payment.method;
      if (paymentMethod !== "all" && method !== paymentMethod) { return false; }
      if (cashier !== "all" && String(sale.cashier && sale.cashier.name || "") !== cashier) { return false; }
      return !query || String(sale.receiptNumber || "").toLowerCase().indexOf(query) !== -1;
    });

    filtered.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    var revenue = 0;
    for (var i = 0; i < filtered.length; i++) {
      revenue = money.roundMoney(revenue + Number(filtered[i].total || 0));
    }
    return { sales: filtered, transactionCount: filtered.length, totalRevenue: revenue };
  }

  global.GCK = global.GCK || {};
  global.GCK.salesHistory = { dateKey: dateKey, getHistory: getHistory };
})(window);
