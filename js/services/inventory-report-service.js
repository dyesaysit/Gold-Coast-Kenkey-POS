/* Read-only inventory reporting. Uses current storage data and includes only
 * products that explicitly opt into inventory tracking. */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;

  function getStatus(product) {
    var stock = Number(product.stockQuantity) || 0;
    var threshold = Number(product.lowStockLevel) || 0;
    if (stock <= 0) { return "out"; }
    if (stock <= threshold) { return "low"; }
    return "in";
  }

  function getSummary() {
    var products = storage.getInventoryProducts().filter(function (product) {
      return product && product.trackInventory === true &&
        product.productType !== "configured-meal" &&
        product.itemType !== "configured-meal";
    }).map(function (product) {
      return {
        id: product.id,
        name: product.name || "Unnamed product",
        stockQuantity: Math.max(0, Number(product.stockQuantity) || 0),
        lowStockLevel: Math.max(0, Number(product.lowStockLevel) || 0),
        status: getStatus(product)
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    var totalUnits = 0;
    var lowStockCount = 0;
    var outOfStockCount = 0;
    for (var i = 0; i < products.length; i++) {
      totalUnits += products[i].stockQuantity;
      if (products[i].status === "low") { lowStockCount += 1; }
      if (products[i].status === "out") { outOfStockCount += 1; }
    }
    return {
      products: products,
      totalProducts: products.length,
      totalUnits: totalUnits,
      lowStockCount: lowStockCount,
      outOfStockCount: outOfStockCount
    };
  }

  function filterProducts(products, filter, search) {
    var wanted = filter || "all";
    var query = String(search || "").trim().toLowerCase();
    return products.filter(function (product) {
      var matchesStatus = wanted === "all" || product.status === wanted;
      var matchesSearch = !query || product.name.toLowerCase().indexOf(query) !== -1;
      return matchesStatus && matchesSearch;
    });
  }

  global.GCK = global.GCK || {};
  global.GCK.inventoryReport = {
    getSummary: getSummary,
    filterProducts: filterProducts
  };
})(window);
