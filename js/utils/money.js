/*
 * money.js
 * Shared money helpers. Every total in the application must pass through these
 * functions so rounding and formatting stay consistent (AGENTS.md rule 3.15).
 *
 * Loaded as a plain script. It attaches itself to the global GCK namespace so
 * the other files can reuse it without a module bundler.
 */
(function (global) {
  "use strict";

  // Default symbol. app.js overrides this from stored settings after load.
  var currencySymbol = "GH₵"; // GH₵

  /**
   * Round a monetary value to two decimal places.
   * Uses Number.EPSILON to avoid floating-point rounding surprises
   * (e.g. 1.005 rounding down). See DATABASE-DESIGN.md section 16.
   */
  function roundMoney(value) {
    var amount = Number(value);
    if (!isFinite(amount)) {
      amount = 0;
    }
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  /**
   * Format a value as a display price, e.g. "GH₵42.00".
   * Always shows exactly two decimals.
   */
  function formatMoney(value) {
    return currencySymbol + roundMoney(value).toFixed(2);
  }

  /** Allow the currency symbol to be set once from stored settings. */
  function setCurrencySymbol(symbol) {
    if (typeof symbol === "string" && symbol.length > 0) {
      currencySymbol = symbol;
    }
  }

  function getCurrencySymbol() {
    return currencySymbol;
  }

  global.GCK = global.GCK || {};
  global.GCK.money = {
    roundMoney: roundMoney,
    formatMoney: formatMoney,
    setCurrencySymbol: setCurrencySymbol,
    getCurrencySymbol: getCurrencySymbol
  };
})(window);
