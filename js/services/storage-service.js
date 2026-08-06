/*
 * storage-service.js
 * The single storage layer for the whole application (AGENTS.md section 8).
 * UI code must call these functions instead of touching localStorage directly,
 * so there is one place that handles keys, JSON, and corrupt data.
 *
 * Keys follow DATABASE-DESIGN.md section 14 (all prefixed "gckpos.").
 */
(function (global) {
  "use strict";

  var KEYS = {
    categories: "gckpos.categories",
    menuItems: "gckpos.menuItems",
    portions: "gckpos.portions",
    proteins: "gckpos.proteins",
    extras: "gckpos.extras",
    inventoryProducts: "gckpos.inventoryProducts",
    sales: "gckpos.sales",
    cashiers: "gckpos.cashiers",
    settings: "gckpos.settings",
    currentCart: "gckpos.currentCart",
    session: "gckpos.session"
  };

  /**
   * Read and parse a stored value. Returns the fallback when the key is missing
   * OR when the stored text is corrupt, so a bad value never crashes the app
   * (AGENTS.md rule 8.6, validation rule "Corrupt stored data").
   */
  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return fallback;
      }
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
      // Corrupt data: warn once and fall back rather than breaking the page.
      console.warn("Corrupt data for " + key + ", using fallback.", error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Could not save " + key + ".", error);
      return false;
    }
  }

  // --- Product catalogue (read-mostly reference data) ----------------------

  function getCategories() { return readJson(KEYS.categories, []); }
  function saveCategories(categories) { return writeJson(KEYS.categories, categories); }

  function getMenuItems() { return readJson(KEYS.menuItems, []); }
  function saveMenuItems(menuItems) { return writeJson(KEYS.menuItems, menuItems); }

  function getPortions() { return readJson(KEYS.portions, []); }
  function savePortions(portions) { return writeJson(KEYS.portions, portions); }

  function getProteins() { return readJson(KEYS.proteins, []); }
  function saveProteins(proteins) { return writeJson(KEYS.proteins, proteins); }

  function getExtras() { return readJson(KEYS.extras, []); }
  function saveExtras(extras) { return writeJson(KEYS.extras, extras); }

  function getInventoryProducts() { return readJson(KEYS.inventoryProducts, []); }
  function saveInventoryProducts(products) { return writeJson(KEYS.inventoryProducts, products); }

  // --- Combined product access (management screen) -------------------------
  // The catalogue is split across two arrays: configured meals live in
  // menuItems, simple products in inventoryProducts. The management screen
  // treats them as one list. saveProduct routes a product to the correct array
  // by productType and removes any stale copy, so a product that changes type
  // is never duplicated.

  function getProducts() {
    return getMenuItems().concat(getInventoryProducts());
  }

  function saveProduct(product) {
    var meals = getMenuItems().filter(function (m) { return m.id !== product.id; });
    var simple = getInventoryProducts().filter(function (p) { return p.id !== product.id; });
    if (product.productType === "configured-meal") {
      meals.push(product);
    } else {
      simple.push(product);
    }
    var okMeals = saveMenuItems(meals);
    var okSimple = saveInventoryProducts(simple);
    return okMeals && okSimple;
  }

  function getCashiers() { return readJson(KEYS.cashiers, []); }
  function saveCashiers(cashiers) { return writeJson(KEYS.cashiers, cashiers); }

  function getSettings() { return readJson(KEYS.settings, null); }
  function saveSettings(settings) { return writeJson(KEYS.settings, settings); }

  // --- Sales history (kept separate from current product data) -------------

  function getSales() { return readJson(KEYS.sales, []); }

  /** Append one completed sale snapshot. Later checkout feature will call this. */
  function saveSale(sale) {
    var sales = getSales();
    sales.push(sale);
    return writeJson(KEYS.sales, sales);
  }

  // --- Current cart --------------------------------------------------------

  function getCurrentCart() { return readJson(KEYS.currentCart, []); }
  function saveCurrentCart(cart) { return writeJson(KEYS.currentCart, cart); }
  function clearCurrentCart() { return writeJson(KEYS.currentCart, []); }

  // --- Active user session -------------------------------------------------
  // Stores only the signed-in user snapshot (id, name, role) - never the PIN.

  function getSession() { return readJson(KEYS.session, null); }
  function saveSession(sessionUser) { return writeJson(KEYS.session, sessionUser); }

  function clearSession() {
    try {
      localStorage.removeItem(KEYS.session);
      return true;
    } catch (error) {
      console.error("Could not clear session.", error);
      return false;
    }
  }

  // --- First-launch seeding -----------------------------------------------

  /**
   * Write seed data only for keys that are still empty, so a returning user's
   * saved data is never erased (AGENTS.md rule 8.7). Safe to call on every load.
   */
  function seedInitialData() {
    var seed = global.GCK.seedData;
    if (!seed) {
      console.error("Seed data not loaded.");
      return;
    }
    if (localStorage.getItem(KEYS.settings) === null) { saveSettings(seed.settings); }
    if (localStorage.getItem(KEYS.cashiers) === null) { saveCashiers(seed.cashiers); }
    if (localStorage.getItem(KEYS.categories) === null) { saveCategories(seed.categories); }
    if (localStorage.getItem(KEYS.menuItems) === null) { saveMenuItems(seed.menuItems); }
    if (localStorage.getItem(KEYS.portions) === null) { savePortions(seed.portions); }
    if (localStorage.getItem(KEYS.proteins) === null) { saveProteins(seed.proteins); }
    if (localStorage.getItem(KEYS.extras) === null) { saveExtras(seed.extras); }
    if (localStorage.getItem(KEYS.inventoryProducts) === null) {
      saveInventoryProducts(seed.inventoryProducts);
    }
    if (localStorage.getItem(KEYS.currentCart) === null) { clearCurrentCart(); }
  }

  global.GCK = global.GCK || {};
  global.GCK.storage = {
    KEYS: KEYS,
    getCategories: getCategories,
    saveCategories: saveCategories,
    getMenuItems: getMenuItems,
    saveMenuItems: saveMenuItems,
    getPortions: getPortions,
    savePortions: savePortions,
    getProteins: getProteins,
    saveProteins: saveProteins,
    getExtras: getExtras,
    saveExtras: saveExtras,
    getInventoryProducts: getInventoryProducts,
    saveInventoryProducts: saveInventoryProducts,
    getProducts: getProducts,
    saveProduct: saveProduct,
    getCashiers: getCashiers,
    saveCashiers: saveCashiers,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getSales: getSales,
    saveSale: saveSale,
    getCurrentCart: getCurrentCart,
    saveCurrentCart: saveCurrentCart,
    clearCurrentCart: clearCurrentCart,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    seedInitialData: seedInitialData
  };
})(window);
