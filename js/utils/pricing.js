/*
 * pricing.js
 * Shared pricing calculations. This is business logic only: no DOM, no storage.
 * These are the single source of truth for money math so no feature branch
 * duplicates a total (AGENTS.md rules 4.3 and 4.4).
 *
 * Formulas come from PROJECT-SPECIFICATION.md section 6.4:
 *   meal unit total = base portion price + sum(extra price x extra quantity)
 *   line total      = meal unit total x meal quantity
 */
(function (global) {
  "use strict";

  var money = global.GCK.money;

  /**
   * Total charge for the selected extras.
   * @param {Array} extras - items shaped like { unitPrice, quantity }.
   */
  function calculateExtrasTotal(extras) {
    var total = 0;
    var list = Array.isArray(extras) ? extras : [];
    for (var i = 0; i < list.length; i++) {
      var unitPrice = Number(list[i].unitPrice) || 0;
      var quantity = Number(list[i].quantity) || 0;
      total += unitPrice * quantity;
    }
    return money.roundMoney(total);
  }

  /**
   * Unit total for one configured meal (before meal quantity).
   * Included proteins add nothing unless the option carries an additionalPrice
   * (AGENTS.md rule 3.6).
   * @param {number} basePortionPrice
   * @param {object} protein - { additionalPrice } or null.
   * @param {Array} extras - list of { unitPrice, quantity }.
   */
  function calculateConfiguredMealTotal(basePortionPrice, protein, extras) {
    var base = Number(basePortionPrice) || 0;
    var proteinCharge = protein ? Number(protein.additionalPrice) || 0 : 0;
    var extrasCharge = calculateExtrasTotal(extras);
    return money.roundMoney(base + proteinCharge + extrasCharge);
  }

  /**
   * Line total for any cart item.
   * @param {number} unitTotal - price for a single unit.
   * @param {number} quantity - whole-number quantity.
   */
  function calculateLineTotal(unitTotal, quantity) {
    var unit = Number(unitTotal) || 0;
    var qty = Number(quantity) || 0;
    return money.roundMoney(unit * qty);
  }

  /**
   * Subtotal across all cart items. Each item is expected to already carry a
   * lineTotal; if it does not, fall back to unitTotal x quantity.
   */
  function calculateCartSubtotal(cartItems) {
    var subtotal = 0;
    var list = Array.isArray(cartItems) ? cartItems : [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var line = item.lineTotal;
      if (typeof line !== "number") {
        line = calculateLineTotal(item.unitTotal || item.unitPrice, item.quantity);
      }
      subtotal += Number(line) || 0;
    }
    return money.roundMoney(subtotal);
  }

  /**
   * Final sale total. Version 1 keeps discount at zero but the field is kept so
   * receipts stay compatible with the data model (DATABASE-DESIGN.md section 10).
   */
  function calculateSaleTotal(subtotal, discount) {
    var sub = Number(subtotal) || 0;
    var disc = Number(discount) || 0;
    return money.roundMoney(sub - disc);
  }

  /**
   * Customer change: amount paid minus the sale total.
   * PROJECT-SPECIFICATION.md section 8.
   */
  function calculateChange(amountPaid, saleTotal) {
    var paid = Number(amountPaid) || 0;
    var total = Number(saleTotal) || 0;
    return money.roundMoney(paid - total);
  }

  global.GCK = global.GCK || {};
  global.GCK.pricing = {
    calculateExtrasTotal: calculateExtrasTotal,
    calculateConfiguredMealTotal: calculateConfiguredMealTotal,
    calculateLineTotal: calculateLineTotal,
    calculateCartSubtotal: calculateCartSubtotal,
    calculateSaleTotal: calculateSaleTotal,
    calculateChange: calculateChange
  };
})(window);
