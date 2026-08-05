/*
 * validation.js
 * Shared input validation. Business logic only, no DOM. Every rule here maps to
 * AGENTS.md section 7 and the checkout rules in PROJECT-SPECIFICATION.md.
 *
 * Validators return a plain result object so the UI can show clear messages:
 *   { valid: boolean, message: string }
 * Never trust user input (AGENTS.md rule "Never trust user input").
 */
(function (global) {
  "use strict";

  var pricing = global.GCK.pricing;

  /** Quantities must be positive whole numbers (AGENTS.md rule 3.14). */
  function isPositiveInteger(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 && Math.floor(number) === number;
  }

  /** A price must be a finite number that is zero or greater. */
  function isValidPrice(value) {
    var number = Number(value);
    return isFinite(number) && number >= 0;
  }

  /** Amount paid must be a finite, non-negative number. */
  function isValidAmountPaid(value) {
    if (value === null || value === undefined || value === "") {
      return false;
    }
    var number = Number(value);
    return isFinite(number) && number >= 0;
  }

  /** True when the cart holds no items. */
  function isCartEmpty(cartItems) {
    return !Array.isArray(cartItems) || cartItems.length === 0;
  }

  /**
   * Validate a cash checkout before it is allowed to complete.
   * Returns the first problem found so the cashier sees one clear message.
   * (Full checkout is a later feature; this shared validator is ready for it.)
   */
  function validateCheckout(cartItems, amountPaid) {
    if (isCartEmpty(cartItems)) {
      return { valid: false, message: "The cart is empty. Add an item before checkout." };
    }
    if (!isValidAmountPaid(amountPaid)) {
      return { valid: false, message: "Enter a valid amount paid." };
    }
    var total = pricing.calculateCartSubtotal(cartItems);
    if (Number(amountPaid) < total) {
      return { valid: false, message: "Amount paid is less than the total." };
    }
    return { valid: true, message: "" };
  }

  /**
   * Check that an inventory product has enough stock for the requested quantity.
   * PROJECT-SPECIFICATION.md section 9 recommended rule.
   */
  function validateStockAvailable(stockQuantity, requestedQuantity) {
    if (!isPositiveInteger(requestedQuantity)) {
      return { valid: false, message: "Quantity must be a positive whole number." };
    }
    if (Number(requestedQuantity) > Number(stockQuantity)) {
      return {
        valid: false,
        message: "Only " + Number(stockQuantity) + " available."
      };
    }
    return { valid: true, message: "" };
  }

  global.GCK = global.GCK || {};
  global.GCK.validation = {
    isPositiveInteger: isPositiveInteger,
    isValidPrice: isValidPrice,
    isValidAmountPaid: isValidAmountPaid,
    isCartEmpty: isCartEmpty,
    validateCheckout: validateCheckout,
    validateStockAvailable: validateStockAvailable
  };
})(window);
