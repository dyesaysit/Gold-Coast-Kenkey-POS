/* Pure POS product filtering shared by the UI and tests. */
(function (global) {
  "use strict";

  function getVisibleProducts(menuItems, inventoryProducts, categoryId, searchText) {
    var products = (menuItems || []).concat(inventoryProducts || []).filter(function (product) {
      return product.active === true;
    });
    var category = categoryId || "all";
    var query = String(searchText || "").trim().toLowerCase();

    return products.filter(function (product) {
      var categoryMatches = category === "all"
        || (category === "popular" ? product.popular === true : product.categoryId === category);
      var searchMatches = !query || String(product.name || "").toLowerCase().indexOf(query) !== -1;
      return categoryMatches && searchMatches;
    });
  }

  global.GCK = global.GCK || {};
  global.GCK.posCatalog = { getVisibleProducts: getVisibleProducts };
})(window);
