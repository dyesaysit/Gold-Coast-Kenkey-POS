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

  var lastWriteFailure = null;

  function classifyWriteFailure(error) {
    var name = error && error.name ? String(error.name) : "";
    var code = error && error.code;
    var isCapacity = name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
    return {
      code: isCapacity ? "storage_capacity" : "storage_write_failed",
      message: isCapacity
        ? "Browser storage is full. Free some browser storage, then try the sale again."
        : "The sale could not be saved. Check browser storage access, then try again."
    };
  }

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
    lastWriteFailure = null;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      lastWriteFailure = classifyWriteFailure(error);
      console.error("Could not save " + key + ".", error);
      return false;
    }
  }

  function getRawValue(key) {
    try {
      return { readable: true, value: localStorage.getItem(key) };
    } catch (error) {
      return { readable: false, value: null };
    }
  }

  function restoreRawValue(key, snapshot) {
    try {
      if (snapshot.value === null) { localStorage.removeItem(key); }
      else { localStorage.setItem(key, snapshot.value); }
      return true;
    } catch (error) {
      console.error("Could not restore " + key + " after a failed sale.", error);
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

  function saveCashier(cashier) {
    var cashiers = getCashiers();
    var replaced = false;
    for (var i = 0; i < cashiers.length; i++) {
      if (cashiers[i].id === cashier.id) {
        cashiers[i] = cashier;
        replaced = true;
        break;
      }
    }
    if (!replaced) { cashiers.push(cashier); }
    return saveCashiers(cashiers);
  }

  function getSettings() { return readJson(KEYS.settings, null); }
  function saveSettings(settings) { return writeJson(KEYS.settings, settings); }

  // --- Sales history (kept separate from current product data) -------------

  function getSales() { return readJson(KEYS.sales, []); }

  /** Append one completed sale snapshot. */
  function saveSale(sale) {
    var sales = getSales();
    sales.push(sale);
    return writeJson(KEYS.sales, sales);
  }

  function pad(value, width) {
    var s = String(value);
    while (s.length < width) { s = "0" + s; }
    return s;
  }

  /**
   * Human-readable, per-day sequential receipt number: PREFIX-YYYYMMDD-NNNN
   * (DATABASE-DESIGN.md section 17). The sequence resets each day.
   */
  function generateReceiptNumber() {
    var settings = getSettings() || {};
    var prefix = settings.receiptPrefix || "GCK";
    var now = new Date();
    var datePart = "" + now.getFullYear() + pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2);
    var todayPrefix = prefix + "-" + datePart + "-";
    var todayCount = getSales().filter(function (sale) {
      return sale.receiptNumber && sale.receiptNumber.indexOf(todayPrefix) === 0;
    }).length;
    return todayPrefix + pad(todayCount + 1, 4);
  }

  /** Complete a sale with compensating rollback across the three storage keys. */
  function completeSale(sale) {
    var inventory = getInventoryProducts();
    var sales = getSales();
    var previous = {};
    previous[KEYS.inventoryProducts] = getRawValue(KEYS.inventoryProducts);
    previous[KEYS.sales] = getRawValue(KEYS.sales);
    previous[KEYS.currentCart] = getRawValue(KEYS.currentCart);
    if (!previous[KEYS.inventoryProducts].readable || !previous[KEYS.sales].readable || !previous[KEYS.currentCart].readable) {
      return {
        success: false,
        code: "storage_read_failed",
        stage: "prepare",
        rollbackSuccessful: true,
        message: "The current sale data could not be read safely. Reload the app and try again."
      };
    }

    var indexById = {};
    for (var i = 0; i < inventory.length; i++) {
      indexById[inventory[i].id] = i;
    }

    var items = sale.items || [];
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var tracked = (typeof item.trackInventory === "boolean")
        ? item.trackInventory
        : item.itemType === "inventory-product";
      if (tracked && indexById[item.productId] != null) {
        var product = inventory[indexById[item.productId]];
        var remaining = Number(product.stockQuantity) - Number(item.quantity);
        product.stockQuantity = remaining < 0 ? 0 : remaining;
      }
    }

    var updatedSales = sales.concat([sale]);
    var writes = [
      { key: KEYS.inventoryProducts, value: inventory, stage: "inventory" },
      { key: KEYS.sales, value: updatedSales, stage: "sale" },
      { key: KEYS.currentCart, value: [], stage: "cart" }
    ];

    // Serialize every new value before the first write.
    try {
      for (var k = 0; k < writes.length; k++) { JSON.stringify(writes[k].value); }
    } catch (error) {
      return {
        success: false,
        code: "storage_write_failed",
        stage: "prepare",
        rollbackSuccessful: true,
        message: "The sale contains data that cannot be saved. Review the cart and try again."
      };
    }

    for (var w = 0; w < writes.length; w++) {
      if (!writeJson(writes[w].key, writes[w].value)) {
        var rollbackSuccessful = true;
        for (var r = 0; r < writes.length; r++) {
          if (!restoreRawValue(writes[r].key, previous[writes[r].key])) {
            rollbackSuccessful = false;
          }
        }
        var failure = lastWriteFailure || classifyWriteFailure(null);
        return {
          success: false,
          code: rollbackSuccessful ? failure.code : "storage_rollback_failed",
          stage: writes[w].stage,
          rollbackSuccessful: rollbackSuccessful,
          message: rollbackSuccessful
            ? failure.message
            : "The sale was not saved safely. Stop checkout and reload the app before trying again."
        };
      }
    }

    return { success: true, code: "", stage: "complete", rollbackSuccessful: true, message: "" };
  }

  function createReceiptSettingsSnapshot(settings) {
    settings = settings || {};
    return {
      businessName: settings.businessName || "",
      shortName: settings.shortName || "",
      logo: settings.logo || "",
      phone: settings.phone || "",
      address: settings.address || "",
      receiptFooter: settings.receiptFooterNote || "",
      extraReceiptInfo: settings.receiptExtraInfo || "",
      receiptPaperWidth: settings.receiptPaperWidth === "58mm" ? "58mm" : "80mm"
    };
  }

  function getReceiptSettings(sale, currentSettings) {
    var snapshot = sale && sale.receiptSettings;
    if (!snapshot) { return currentSettings || {}; }
    return {
      businessName: snapshot.businessName || "",
      shortName: snapshot.shortName || "",
      logo: snapshot.logo || "",
      phone: snapshot.phone || "",
      address: snapshot.address || "",
      receiptFooterNote: snapshot.receiptFooter || "",
      receiptExtraInfo: snapshot.extraReceiptInfo || "",
      receiptPaperWidth: snapshot.receiptPaperWidth === "58mm" ? "58mm" : "80mm"
    };
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
   * Upgrade catalogues saved before the explicit product contract existed.
   * Collection membership is used only for this one-time migration; all
   * runtime inventory behaviour continues to depend on trackInventory === true.
   * Existing explicit true/false choices are never overwritten.
   */
  function migrateProductContract() {
    var inventory = getInventoryProducts();
    var meals = getMenuItems();
    var inventoryChanged = false;
    var mealsChanged = false;
    var i;

    for (i = 0; i < inventory.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(inventory[i], "trackInventory")) {
        inventory[i].trackInventory = true;
        inventoryChanged = true;
      }
      if (!Object.prototype.hasOwnProperty.call(inventory[i], "productType")) {
        inventory[i].productType = "simple";
        inventoryChanged = true;
      }
    }
    for (i = 0; i < meals.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(meals[i], "trackInventory")) {
        meals[i].trackInventory = false;
        mealsChanged = true;
      }
      if (!Object.prototype.hasOwnProperty.call(meals[i], "productType")) {
        meals[i].productType = "configured-meal";
        mealsChanged = true;
      }
    }
    if (inventoryChanged) { saveInventoryProducts(inventory); }
    if (mealsChanged) { saveMenuItems(meals); }
  }

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
    migrateProductContract();
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
    saveCashier: saveCashier,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getSales: getSales,
    saveSale: saveSale,
    generateReceiptNumber: generateReceiptNumber,
    completeSale: completeSale,
    createReceiptSettingsSnapshot: createReceiptSettingsSnapshot,
    getReceiptSettings: getReceiptSettings,
    getCurrentCart: getCurrentCart,
    saveCurrentCart: saveCurrentCart,
    clearCurrentCart: clearCurrentCart,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    seedInitialData: seedInitialData
  };
})(window);
