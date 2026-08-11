/*
 * inventory-service.js
 * Member 3 (feature/inventory-reports): stock validation and stock reduction.
 *
 * This module is the ONE place inventory stock is checked and reduced, so the
 * checkout feature never touches inventory storage or repeats this logic
 * (AGENTS.md rule 4.5 "do not duplicate stock-reduction logic" and rule 8.2
 * "do not call LocalStorage directly from many UI files").
 *
 * It reuses existing shared utilities and does NOT re-implement them:
 *   - GCK.storage.getInventoryProducts() / saveInventoryProducts()
 *   - GCK.validation.validateStockAvailable()
 *
 * Business rules honoured (AGENTS.md section 3):
 *   - Only inventory products affect stock; configured meals never do (rule 2).
 *   - Stock is reduced only after a sale completes (rule 10): checkout calls
 *     reduceInventoryStock() as a final data step, never during cart building.
 *   - Stock must never go negative (validation rules, prompt rule 9).
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var validation = global.GCK.validation;

  /**
   * Keep only the inventory-product lines from a list of cart or sale items.
   * Configured meals are dropped here so they can never change stock.
   * @param {Array} items - cart items or sale items.
   * @returns {Array} only items whose itemType is "inventory-product".
   */
  function getInventoryLines(items) {
    var result = [];
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].itemType === "inventory-product") {
        result.push(list[i]);
      }
    }
    return result;
  }

  /**
   * Add up how many units of each inventory product a list of items needs.
   * Correctly handles the same product on more than one line, or one line with
   * a quantity above one (prompt rule 10).
   * @returns {Object} map of productId -> total quantity requested.
   */
  function totalQuantityByProduct(items) {
    var totals = {};
    var lines = getInventoryLines(items);
    for (var i = 0; i < lines.length; i++) {
      var id = lines[i].productId;
      var qty = Number(lines[i].quantity) || 0;
      totals[id] = (totals[id] || 0) + qty;
    }
    return totals;
  }

  /**
   * Build a productId -> product lookup so we do not search the array repeatedly.
   */
  function indexById(products) {
    var byId = {};
    for (var i = 0; i < products.length; i++) {
      byId[products[i].id] = products[i];
    }
    return byId;
  }

  /**
   * Check that every inventory product in the cart has enough stock BEFORE the
   * sale is allowed to complete. Checkout calls this at validation time
   * (DATABASE-DESIGN.md section 18, step 3).
   *
   * @param {Array} cartItems - the current cart (meals + inventory products).
   * @returns {{valid: boolean, message: string, shortages: Array}}
   *          valid=true when all products have enough stock.
   *          shortages: { productId, requested, available } for each failure.
   */
  function validateCartStock(cartItems) {
    var requested = totalQuantityByProduct(cartItems);
    var byId = indexById(storage.getInventoryProducts());
    var shortages = [];

    for (var id in requested) {
      if (!Object.prototype.hasOwnProperty.call(requested, id)) {
        continue;
      }
      var product = byId[id];
      var need = requested[id];

      if (!product) {
        shortages.push({ productId: id, requested: need, available: 0 });
        continue;
      }

      // Reuse the shared single-product validator rather than rewriting it.
      var check = validation.validateStockAvailable(product.stockQuantity, need);
      if (!check.valid) {
        shortages.push({
          productId: id,
          requested: need,
          available: Number(product.stockQuantity) || 0
        });
      }
    }

    if (shortages.length > 0) {
      return {
        valid: false,
        message: "Not enough stock for one or more products.",
        shortages: shortages
      };
    }
    return { valid: true, message: "", shortages: [] };
  }

  /**
   * Reduce inventory stock for a COMPLETED sale. Checkout calls this once the
   * sale is validated and the snapshot is created (DATABASE-DESIGN.md section 18,
   * step 5), never during cart building.
   *
   * All-or-nothing: it checks every reduction first and only writes if the whole
   * update is safe, so a failure never leaves stock half-updated (section 18:
   * "do not silently leave partially updated data").
   *
   * @param {Object} sale - completed sale object containing an items array.
   * @returns {{ok: boolean, message: string}} ok=true when stock was saved.
   */
  function reduceInventoryStock(sale) {
    var items = sale && sale.items ? sale.items : [];
    var requested = totalQuantityByProduct(items);
    var byId = indexById(storage.getInventoryProducts());

    // First pass: verify every reduction is possible. Change nothing yet.
    for (var id in requested) {
      if (!Object.prototype.hasOwnProperty.call(requested, id)) {
        continue;
      }
      var product = byId[id];
      var need = requested[id];
      if (!product) {
        return { ok: false, message: "Unknown inventory product: " + id };
      }
      var check = validation.validateStockAvailable(product.stockQuantity, need);
      if (!check.valid) {
        return { ok: false, message: "Not enough stock for " + product.name + "." };
      }
    }

    // Second pass: all checks passed, so apply the reductions.
    for (var id2 in requested) {
      if (!Object.prototype.hasOwnProperty.call(requested, id2)) {
        continue;
      }
      var target = byId[id2];
      target.stockQuantity = (Number(target.stockQuantity) || 0) - requested[id2];
    }

    // Save once, through the shared storage service. byId points at the same
    // product objects returned by storage, so saving that list persists them.
    var saved = storage.saveInventoryProducts(objectValues(byId));
    if (!saved) {
      return { ok: false, message: "Could not save updated stock." };
    }
    return { ok: true, message: "" };
  }

  /** Small helper: collect the values of an object into an array (ES5-safe). */
  function objectValues(object) {
    var values = [];
    for (var key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        values.push(object[key]);
      }
    }
    return values;
  }

  /**
   * Return the active inventory products whose stock has fallen to or below
   * their low-stock level (prompt rule 11). Used by the inventory view and the
   * daily report to warn the owner to restock. "At or below" means the warning
   * fires exactly when stockQuantity === lowStockLevel, not only past it.
   * @returns {Array} products at or below their lowStockLevel.
   */
  function getLowStockProducts() {
    var products = storage.getInventoryProducts();
    var low = [];
    for (var i = 0; i < products.length; i++) {
      var product = products[i];
      if (product.active === false) {
        continue; // inactive products are not sold, so do not warn about them
      }
      if ((Number(product.stockQuantity) || 0) <= (Number(product.lowStockLevel) || 0)) {
        low.push(product);
      }
    }
    return low;
  }

  global.GCK = global.GCK || {};
  global.GCK.inventory = {
    validateCartStock: validateCartStock,
    reduceInventoryStock: reduceInventoryStock,
    getLowStockProducts: getLowStockProducts
  };
})(window);
