/*
 * app.js
 * The user-interface layer. It gates the POS behind a PIN login, renders the
 * signed-in user and role-based navigation, and renders the header, category
 * bar, product tiles, and cart.
 *
 * This file must stay free of business logic and must never touch localStorage
 * directly (AGENTS.md architecture + storage rules). It goes through:
 *   GCK.money       -> formatting and rounding
 *   GCK.pricing     -> totals
 *   GCK.validation  -> input and stock checks
 *   GCK.storage     -> the single storage service
 *   GCK.auth        -> login validation, session, access control
 *
 * Feature screens share the same storage, pricing, validation, and access
 * services so historical receipts and current catalogue data stay separate.
 */
(function (global) {
  "use strict";

  var money = global.GCK.money;
  var pricing = global.GCK.pricing;
  var validation = global.GCK.validation;
  var storage = global.GCK.storage;
  var auth = global.GCK.auth;
  var reports = global.GCK.reports;
  var reportPdf = global.GCK.reportPdf;
  var inventoryReport = global.GCK.inventoryReport;
  var inventoryReportPdf = global.GCK.inventoryReportPdf;
  var salesHistory = global.GCK.salesHistory;
  var backupService = global.GCK.backup;
  var reprint = global.GCK.receiptReprint;
  var posCatalog = global.GCK.posCatalog;

  // In-memory view of catalogue data, loaded once from storage.
  var state = {
    settings: null,
    categories: [],
    menuItems: [],
    portions: [],
    inventoryProducts: [],
    extras: [],
    cart: [],
    activeCategoryId: "all"
  };

  var currentUser = null; // session snapshot { id, name, role } or null
  var pinBuffer = ""; // digits entered on the login pad
  var activeNavKey = "pos"; // only the POS screen exists at this stage

  var elements = {};
  var toastTimer = null;

  // --- Small UI helpers ----------------------------------------------------

  function getElements() {
    // Login view
    elements.loginView = document.getElementById("login-view");
    elements.loginLogo = document.getElementById("login-logo");
    elements.loginBusiness = document.getElementById("login-business");
    elements.pinDots = document.getElementById("pin-dots");
    elements.pinPad = document.getElementById("pin-pad");
    elements.loginError = document.getElementById("login-error");

    // POS view
    elements.posView = document.getElementById("pos-view");
    elements.headerLogo = document.getElementById("header-logo");
    elements.businessName = document.getElementById("business-name");
    elements.userName = document.getElementById("user-name");
    elements.userRole = document.getElementById("user-role");
    elements.appNav = document.getElementById("app-nav");
    elements.logoutButton = document.getElementById("logout-button");
    elements.categoryBar = document.getElementById("category-bar");
    elements.productSearch = document.getElementById("product-search");
    elements.productGrid = document.getElementById("product-grid");
    elements.cartItems = document.getElementById("cart-items");
    elements.cartEmpty = document.getElementById("cart-empty");
    elements.cartSubtotal = document.getElementById("cart-subtotal");
    elements.cartTotal = document.getElementById("cart-total");
    elements.cartCount = document.getElementById("cart-count");
    elements.checkoutButton = document.getElementById("checkout-button");
    elements.toast = document.getElementById("toast");

    // Checkout modal
    elements.checkoutModal = document.getElementById("checkout-modal");
    elements.checkoutOverlay = document.getElementById("checkout-overlay");
    elements.checkoutClose = document.getElementById("checkout-close");
    elements.checkoutTotal = document.getElementById("checkout-total");
    elements.payCash = document.getElementById("pay-cash");
    elements.payMomo = document.getElementById("pay-momo");
    elements.cashFields = document.getElementById("cash-fields");
    elements.momoFields = document.getElementById("momo-fields");
    elements.checkoutAmount = document.getElementById("checkout-amount");
    elements.checkoutChange = document.getElementById("checkout-change");
    elements.checkoutMomoRef = document.getElementById("checkout-momo-ref");
    elements.checkoutError = document.getElementById("checkout-error");
    elements.checkoutCancel = document.getElementById("checkout-cancel");
    elements.checkoutComplete = document.getElementById("checkout-complete");

    // Receipt modal
    elements.receiptModal = document.getElementById("receipt-modal");
    elements.receiptOverlay = document.getElementById("receipt-overlay");
    elements.receiptClose = document.getElementById("receipt-close");
    elements.receiptContent = document.getElementById("receipt-content");
    elements.receiptDone = document.getElementById("receipt-done");
    elements.receiptPrint = document.getElementById("receipt-print");

    // Reprint receipt modal
    elements.reprintButton = document.getElementById("reprint-button");
    elements.reprintModal = document.getElementById("reprint-modal");
    elements.reprintOverlay = document.getElementById("reprint-overlay");
    elements.reprintClose = document.getElementById("reprint-close");
    elements.reprintSearch = document.getElementById("reprint-search");
    elements.reprintError = document.getElementById("reprint-error");
    elements.reprintRecent = document.getElementById("reprint-recent");
    elements.reprintRecentList = document.getElementById("reprint-recent-list");
    elements.reprintCancel = document.getElementById("reprint-cancel");
    elements.reprintFind = document.getElementById("reprint-find");

    // Meal configuration modal
    elements.mealModal = document.getElementById("meal-modal");
    elements.modalOverlay = document.getElementById("modal-overlay");
    elements.modalImage = document.getElementById("modal-image");
    elements.modalMealName = document.getElementById("modal-meal-name");
    elements.modalClose = document.getElementById("modal-close");
    elements.modalPortions = document.getElementById("modal-portions");
    elements.modalIncludedSection = document.getElementById("modal-included-section");
    elements.modalIncluded = document.getElementById("modal-included");
    elements.modalProteinSection = document.getElementById("modal-protein-section");
    elements.modalProteins = document.getElementById("modal-proteins");
    elements.modalExtrasSection = document.getElementById("modal-extras-section");
    elements.modalExtras = document.getElementById("modal-extras");
    elements.modalTotal = document.getElementById("modal-total");
    elements.modalError = document.getElementById("modal-error");
    elements.modalCancel = document.getElementById("modal-cancel");
    elements.modalAdd = document.getElementById("modal-add");

    // POS main area (toggled against the management screen)
    elements.appMain = document.getElementById("app-main");

    // Product & inventory management screen
    elements.manageView = document.getElementById("manage-view");
    elements.manageTitle = document.getElementById("manage-title");
    elements.manageAdd = document.getElementById("manage-add");
    elements.manageClose = document.getElementById("manage-close");
    elements.manageHint = document.getElementById("manage-hint");
    elements.manageList = document.getElementById("manage-list");
    elements.inventoryPrintFormat = document.getElementById("inventory-print-format");
    elements.inventoryPrintSize = document.getElementById("inventory-print-size");
    elements.inventoryPrint = document.getElementById("inventory-print");
    elements.inventoryExportPdf = document.getElementById("inventory-export-pdf");
    elements.inventoryReport = document.getElementById("inventory-report");
    elements.inventoryReportLogo = document.getElementById("inventory-report-logo");
    elements.inventoryReportBusiness = document.getElementById("inventory-report-business");
    elements.inventoryReportPhone = document.getElementById("inventory-report-phone");
    elements.inventoryReportAddress = document.getElementById("inventory-report-address");
    elements.inventoryReportGenerated = document.getElementById("inventory-report-generated");
    elements.inventoryReportContext = document.getElementById("inventory-report-context");
    elements.inventoryTotalProducts = document.getElementById("inventory-total-products");
    elements.inventoryTotalUnits = document.getElementById("inventory-total-units");
    elements.inventoryLowCount = document.getElementById("inventory-low-count");
    elements.inventoryOutCount = document.getElementById("inventory-out-count");
    elements.inventoryReportSearch = document.getElementById("inventory-report-search");
    elements.inventoryReportFilters = document.getElementById("inventory-report-filters");
    elements.inventoryReportTable = document.getElementById("inventory-report-table");

    elements.usersView = document.getElementById("users-view");
    elements.userList = document.getElementById("user-list");
    elements.userAdd = document.getElementById("user-add");
    elements.userModal = document.getElementById("user-modal");
    elements.userOverlay = document.getElementById("user-overlay");
    elements.userModalTitle = document.getElementById("user-modal-title");
    elements.userClose = document.getElementById("user-close");
    elements.userCancel = document.getElementById("user-cancel");
    elements.userSave = document.getElementById("user-save");
    elements.ufName = document.getElementById("uf-name");
    elements.ufPin = document.getElementById("uf-pin");
    elements.ufPinNote = document.getElementById("uf-pin-note");
    elements.ufRole = document.getElementById("uf-role");
    elements.ufActive = document.getElementById("uf-active");
    elements.userError = document.getElementById("user-error");

    elements.settingsView = document.getElementById("settings-view");
    elements.settingsForm = document.getElementById("settings-form");
    elements.sfBusinessName = document.getElementById("sf-business-name");
    elements.sfShortName = document.getElementById("sf-short-name");
    elements.sfLogoPreview = document.getElementById("sf-logo-preview");
    elements.sfLogoFile = document.getElementById("sf-logo-file");
    elements.sfLogoChoose = document.getElementById("sf-logo-choose");
    elements.sfLogoRemove = document.getElementById("sf-logo-remove");
    elements.sfPhone = document.getElementById("sf-phone");
    elements.sfAddress = document.getElementById("sf-address");
    elements.sfCurrencyCode = document.getElementById("sf-currency-code");
    elements.sfCurrencySymbol = document.getElementById("sf-currency-symbol");
    elements.sfReceiptPrefix = document.getElementById("sf-receipt-prefix");
    elements.sfReceiptFooter = document.getElementById("sf-receipt-footer");
    elements.sfReceiptExtraInfo = document.getElementById("sf-receipt-extra-info");
    elements.sfReceiptPaper = document.getElementById("sf-receipt-paper");
    elements.settingsError = document.getElementById("settings-error");
    elements.backupExport = document.getElementById("backup-export");
    elements.backupFile = document.getElementById("backup-file");
    elements.backupChoose = document.getElementById("backup-choose");
    elements.backupRestore = document.getElementById("backup-restore");
    elements.backupError = document.getElementById("backup-error");
    elements.backupPreview = document.getElementById("backup-preview");
    elements.backupBusiness = document.getElementById("backup-business");
    elements.backupDate = document.getElementById("backup-date");
    elements.backupUsers = document.getElementById("backup-users");
    elements.backupProducts = document.getElementById("backup-products");
    elements.backupSales = document.getElementById("backup-sales");
    elements.backupInventory = document.getElementById("backup-inventory");

    elements.reportsView = document.getElementById("reports-view");
    elements.reportsFromDate = document.getElementById("reports-from-date");
    elements.reportsToDate = document.getElementById("reports-to-date");
    elements.reportsFromNative = document.getElementById("reports-from-native");
    elements.reportsToNative = document.getElementById("reports-to-native");
    elements.reportsFromCalendar = document.getElementById("reports-from-calendar");
    elements.reportsToCalendar = document.getElementById("reports-to-calendar");
    elements.reportsApply = document.getElementById("reports-apply");
    elements.reportsPrint = document.getElementById("reports-print");
    elements.reportsExportPdf = document.getElementById("reports-export-pdf");
    elements.reportsPrintSize = document.getElementById("reports-print-size");
    elements.reportsError = document.getElementById("reports-error");
    elements.reportsPrintLogo = document.getElementById("reports-print-logo");
    elements.reportsBusinessName = document.getElementById("reports-business-name");
    elements.reportsBusinessPhone = document.getElementById("reports-business-phone");
    elements.reportsBusinessAddress = document.getElementById("reports-business-address");
    elements.reportsPeriodTitle = document.getElementById("reports-period-title");
    elements.reportsGenerated = document.getElementById("reports-generated");
    elements.reportsRevenue = document.getElementById("reports-revenue");
    elements.reportsCount = document.getElementById("reports-count");
    elements.reportsCash = document.getElementById("reports-cash");
    elements.reportsMomo = document.getElementById("reports-momo");
    elements.reportsBestSeller = document.getElementById("reports-best-seller");
    elements.reportsProducts = document.getElementById("reports-products");
    elements.reportsLowStock = document.getElementById("reports-low-stock");

    elements.salesHistoryView = document.getElementById("sales-history-view");
    elements.salesHistorySearch = document.getElementById("sales-history-search");
    elements.salesHistoryFrom = document.getElementById("sales-history-from");
    elements.salesHistoryTo = document.getElementById("sales-history-to");
    elements.salesHistoryFromNative = document.getElementById("sales-history-from-native");
    elements.salesHistoryToNative = document.getElementById("sales-history-to-native");
    elements.salesHistoryFromCalendar = document.getElementById("sales-history-from-calendar");
    elements.salesHistoryToCalendar = document.getElementById("sales-history-to-calendar");
    elements.salesHistoryPayment = document.getElementById("sales-history-payment");
    elements.salesHistoryCashier = document.getElementById("sales-history-cashier");
    elements.salesHistoryReset = document.getElementById("sales-history-reset");
    elements.salesHistoryError = document.getElementById("sales-history-error");
    elements.salesHistoryCount = document.getElementById("sales-history-count");
    elements.salesHistoryTotal = document.getElementById("sales-history-total");
    elements.salesHistoryBody = document.getElementById("sales-history-body");
    elements.salesHistoryEmpty = document.getElementById("sales-history-empty");
    elements.salesHistoryPrevious = document.getElementById("sales-history-previous");
    elements.salesHistoryNext = document.getElementById("sales-history-next");
    elements.salesHistoryPage = document.getElementById("sales-history-page");

    // Product form modal
    elements.productModal = document.getElementById("product-modal");
    elements.productOverlay = document.getElementById("product-overlay");
    elements.productClose = document.getElementById("product-close");
    elements.productModalTitle = document.getElementById("product-modal-title");
    elements.pfName = document.getElementById("pf-name");
    elements.pfCategory = document.getElementById("pf-category");
    elements.pfType = document.getElementById("pf-type");
    elements.pfMealNote = document.getElementById("pf-meal-note");
    elements.pfPriceField = document.getElementById("pf-price-field");
    elements.pfPrice = document.getElementById("pf-price");
    elements.pfTrackField = document.getElementById("pf-track-field");
    elements.pfTrack = document.getElementById("pf-track");
    elements.pfStockField = document.getElementById("pf-stock-field");
    elements.pfStock = document.getElementById("pf-stock");
    elements.pfLowField = document.getElementById("pf-low-field");
    elements.pfLow = document.getElementById("pf-low");
    elements.pfActive = document.getElementById("pf-active");
    elements.pfPreview = document.getElementById("pf-preview");
    elements.pfFile = document.getElementById("pf-file");
    elements.pfChoose = document.getElementById("pf-choose");
    elements.pfRemove = document.getElementById("pf-remove");
    elements.pfError = document.getElementById("pf-error");
    elements.pfCancel = document.getElementById("pf-cancel");
    elements.pfSave = document.getElementById("pf-save");

    // Menu editor: packages (portions) + allowed extras (meals only)
    elements.pfPackagesSection = document.getElementById("pf-packages-section");
    elements.pfPackagesList = document.getElementById("pf-packages-list");
    elements.pfAddPackage = document.getElementById("pf-add-package");
    elements.pfExtrasSection = document.getElementById("pf-extras-section");
    elements.pfExtrasList = document.getElementById("pf-extras-list");
    elements.pfManageExtras = document.getElementById("pf-manage-extras");

    // Extras library modal
    elements.extrasModal = document.getElementById("extras-modal");
    elements.extrasOverlay = document.getElementById("extras-overlay");
    elements.extrasClose = document.getElementById("extras-close");
    elements.extrasEditorList = document.getElementById("extras-editor-list");
    elements.extrasAdd = document.getElementById("extras-add");
    elements.extrasError = document.getElementById("extras-error");
    elements.extrasCancel = document.getElementById("extras-cancel");
    elements.extrasSave = document.getElementById("extras-save");
  }

  /** Show a short, clear message (UI-GUIDELINES.md section 16). */
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      elements.toast.hidden = true;
    }, 2500);
  }

  /** Create a unique id for a cart line (DATABASE-DESIGN.md section 17). */
  function createId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }

  // --- Data loading --------------------------------------------------------

  function loadState() {
    state.settings = storage.getSettings();
    state.categories = storage.getCategories();
    state.menuItems = storage.getMenuItems();
    state.portions = storage.getPortions();
    state.inventoryProducts = storage.getInventoryProducts();
    state.extras = storage.getExtras();
    state.cart = storage.getCurrentCart();

    if (state.settings && state.settings.currencySymbol) {
      money.setCurrencySymbol(state.settings.currencySymbol);
    }
  }

  /** Render the business name and logo (login + header) from settings only. */
  function applyBranding() {
    var settings = state.settings || {};
    var name = settings.businessName || "";
    elements.businessName.textContent = name;
    elements.loginBusiness.textContent = name;
    document.title = (name ? name + " · " : "") + "Point of Sale";
    renderLogo(elements.headerLogo, settings);
    renderLogo(elements.loginLogo, settings);
  }

  /**
   * Fill a brand-logo slot from settings: the logo image when set, otherwise a
   * short-name wordmark. Leaves the slot empty (hidden) if neither is available.
   */
  function renderLogo(element, settings) {
    if (!element) {
      return;
    }
    element.innerHTML = "";
    if (settings.logo) {
      var img = document.createElement("img");
      img.src = settings.logo;
      img.alt = (settings.businessName || "Business") + " logo";
      img.addEventListener("error", function () {
        element.textContent = settings.shortName || "";
      });
      element.appendChild(img);
    } else {
      element.textContent = settings.shortName || "";
    }
  }

  // --- Login (PIN pad) -----------------------------------------------------

  function bindAuthEvents() {
    // One delegated handler for the whole pad (event delegation, no per-key wiring).
    elements.pinPad.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.getAttribute("data-key")) {
        pressDigit(button.getAttribute("data-key"));
      } else if (button.getAttribute("data-action") === "clear") {
        clearPin();
      } else if (button.getAttribute("data-action") === "back") {
        backspacePin();
      }
    });

    elements.logoutButton.addEventListener("click", handleLogout);
  }

  // Cancel, Close, overlay click and Escape all dismiss the modal without
  // touching the cart. Only "Add to Cart" changes the cart.
  function bindModalEvents() {
    elements.modalAdd.addEventListener("click", addConfiguredMealToCart);
    elements.modalCancel.addEventListener("click", closeMealModal);
    elements.modalClose.addEventListener("click", closeMealModal);
    elements.modalOverlay.addEventListener("click", closeMealModal);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.mealModal.hidden) {
        closeMealModal();
      }
    });
  }

  function pressDigit(digit) {
    if (pinBuffer.length >= auth.MAX_PIN_LENGTH) {
      return; // enforce the 6-digit maximum
    }
    pinBuffer += digit;
    setLoginError("");
    renderPinDots();
    attemptLogin();
  }

  function clearPin() {
    pinBuffer = "";
    setLoginError("");
    renderPinDots();
  }

  function backspacePin() {
    pinBuffer = pinBuffer.slice(0, -1);
    setLoginError("");
    renderPinDots();
  }

  /**
   * Render the masked PIN dots. At rest we show MIN_PIN_LENGTH dots (the usual
   * 4-digit PIN) rather than the 6-digit maximum, so the pad is not padded with
   * misleading empty circles. The row grows if a longer PIN is entered, up to
   * the maximum.
   */
  function renderPinDots() {
    elements.pinDots.innerHTML = "";
    var dotsToShow = Math.max(auth.MIN_PIN_LENGTH, pinBuffer.length);
    if (dotsToShow > auth.MAX_PIN_LENGTH) {
      dotsToShow = auth.MAX_PIN_LENGTH;
    }
    for (var i = 0; i < dotsToShow; i++) {
      var dot = document.createElement("span");
      dot.className = "pin-dot" + (i < pinBuffer.length ? " pin-dot--filled" : "");
      elements.pinDots.appendChild(dot);
    }
  }

  function setLoginError(message) {
    elements.loginError.textContent = message;
  }

  /**
   * Try to sign in with the digits entered so far. Because PINs are fixed-length
   * there is no separate Enter key: a correct PIN signs in as soon as it matches,
   * and a full-length wrong PIN shows an error and resets.
   */
  function attemptLogin() {
    var result = auth.login(pinBuffer); // persists the session only on success
    if (result.valid) {
      currentUser = result.user;
      clearPin();
      showPos();
      showToast("Welcome, " + currentUser.name + ".");
    } else if (pinBuffer.length >= auth.MAX_PIN_LENGTH) {
      setLoginError(result.message);
      pinBuffer = "";
      renderPinDots();
    }
  }

  function handleLogout() {
    auth.logout();
    currentUser = null;
    showLogin();
  }

  // --- View switching ------------------------------------------------------

  function showPos() {
    elements.loginView.hidden = true;
    elements.posView.hidden = false;
    renderUserArea();
    showSection(defaultNavKeyFor(currentUser));
    syncHeaderHeight();
  }

  /** Measure the header so the desktop cart sidebar sits just below it. */
  function syncHeaderHeight() {
    var header = document.querySelector(".app-header");
    if (header && elements.posView && header.offsetHeight > 0) {
      elements.posView.style.setProperty("--header-height", header.offsetHeight + "px");
    }
  }

  /** The section a role lands on: its first accessible nav item. */
  function defaultNavKeyFor(user) {
    var nav = user ? auth.getAccessibleNav(user.role) : [];
    return nav.length ? nav[0].key : "pos";
  }

  /**
   * Switch the visible section. POS shows the sales grid + cart; Products and
   * Inventory show the management screen; each other key owns one page view.
   */
  function showSection(key) {
    if (!currentUser || !auth.canAccess(currentUser.role, key)) {
      showToast("You do not have access to that section.");
      key = "pos";
    }
    activeNavKey = key;
    var isPos = (key === "pos");
    var isManage = (key === "products" || key === "inventory");
    // The desktop cart sidebar's width is only reserved on the POS screen.
    elements.posView.setAttribute("data-cart", isPos ? "on" : "off");
    elements.categoryBar.hidden = !isPos;
    elements.appMain.hidden = !isPos;
    elements.manageView.hidden = !isManage;
    elements.usersView.hidden = key !== "users";
    elements.settingsView.hidden = key !== "settings";
    elements.reportsView.hidden = key !== "reports";
    elements.salesHistoryView.hidden = key !== "sales-history";
    if (isManage) {
      renderManageScreen(key);
    } else if (key === "users") {
      renderUsers();
    } else if (key === "settings") {
      renderSettings();
    } else if (key === "reports") {
      renderReports();
    } else if (key === "sales-history") {
      renderSalesHistory();
    }
    renderNav();
  }

  function showLogin() {
    elements.posView.hidden = true;
    elements.loginView.hidden = false;
    clearPin();
  }

  function renderUserArea() {
    if (!currentUser) {
      return;
    }
    elements.userName.textContent = currentUser.name;
    elements.userRole.textContent = currentUser.role; // CSS capitalises it
  }

  // --- Role-based navigation ----------------------------------------------

  /**
   * Render only the navigation items the current role may access
   * (cashier: POS; supervisor: POS, Products, Inventory, Sales History,
   * Reports; admin: all sections). This is the visible half of access control;
   * the allowed list itself lives in the auth service.
   */
  function renderNav() {
    elements.appNav.innerHTML = "";
    if (!currentUser) {
      return;
    }
    var items = auth.getAccessibleNav(currentUser.role);
    for (var i = 0; i < items.length; i++) {
      elements.appNav.appendChild(buildNavItem(items[i]));
    }
  }

  function buildNavItem(item) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "app-nav__item";
    if (item.key === activeNavKey) {
      button.className += " app-nav__item--active";
    }
    button.textContent = item.label;
    button.addEventListener("click", function () {
      handleNavClick(item);
    });
    return button;
  }

  function handleNavClick(item) {
    if (item.key === "pos") {
      showSection("pos");
      return;
    }
    if (item.key === "products" || item.key === "inventory" || item.key === "users" || item.key === "settings" || item.key === "reports" || item.key === "sales-history") {
      // Nav is already role-filtered; this guard is defence in depth.
      if (currentUser && auth.canAccess(currentUser.role, item.key)) {
        showSection(item.key);
      } else {
        showToast("You do not have access to " + item.label + ".");
      }
      return;
    }
    // Defensive fallback for an unknown nav key; every real section is handled
    // above.
    showToast(item.label + " is not available.");
  }

  /** Lowest active portion price for a meal, used for the "From ..." label. */
  function getStartingPrice(menuItemId) {
    var lowest = null;
    for (var i = 0; i < state.portions.length; i++) {
      var portion = state.portions[i];
      if (portion.menuItemId === menuItemId && portion.active) {
        if (lowest === null || portion.price < lowest) {
          lowest = portion.price;
        }
      }
    }
    return lowest;
  }

  /**
   * Build one combined list of tiles from configured meals and inventory
   * products, filtered by the active category and active flag.
   */
  function getVisibleProducts() {
    return posCatalog.getVisibleProducts(
      state.menuItems,
      state.inventoryProducts,
      state.activeCategoryId,
      elements.productSearch.value
    );
  }

  // --- Rendering: categories ----------------------------------------------

  function renderCategories() {
    elements.categoryBar.innerHTML = "";

    var chips = [{ id: "all", name: "All" }, { id: "popular", name: "Popular" }];
    var sorted = state.categories.slice().sort(function (a, b) {
      return a.displayOrder - b.displayOrder;
    });
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].active) {
        chips.push({ id: sorted[i].id, name: sorted[i].name });
      }
    }

    for (var j = 0; j < chips.length; j++) {
      elements.categoryBar.appendChild(buildCategoryChip(chips[j]));
    }
  }

  function buildCategoryChip(category) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    if (category.id === state.activeCategoryId) {
      button.className += " category-chip--active";
    }
    button.textContent = category.name;
    button.setAttribute("aria-pressed", category.id === state.activeCategoryId ? "true" : "false");
    button.addEventListener("click", function () {
      state.activeCategoryId = category.id;
      renderCategories();
      renderProducts();
    });
    return button;
  }

  // --- Rendering: product tiles -------------------------------------------

  function renderProducts() {
    elements.productGrid.innerHTML = "";
    var products = getVisibleProducts();

    if (products.length === 0) {
      var empty = document.createElement("p");
      empty.className = "cart__empty";
      empty.textContent = elements.productSearch.value.trim()
        ? "No products match your search."
        : "No products in this category.";
      elements.productGrid.appendChild(empty);
      return;
    }

    for (var i = 0; i < products.length; i++) {
      elements.productGrid.appendChild(buildProductTile(products[i]));
    }
  }

  /**
   * Build the picture area for a product tile. If the product has an image path
   * and the file loads, the photo is shown; otherwise a labelled placeholder
   * appears so the owner knows a picture can be added there.
   */
  function buildImageArea(product) {
    var imageWrap = document.createElement("div");
    imageWrap.className = "product-tile__image";

    if (product.image) {
      var img = document.createElement("img");
      img.src = product.image;
      img.alt = product.name;
      img.addEventListener("error", function () {
        showImagePlaceholder(imageWrap);
      });
      imageWrap.appendChild(img);
    } else {
      showImagePlaceholder(imageWrap);
    }
    return imageWrap;
  }

  /** Replace an image area's contents with the "add photo" placeholder. */
  function showImagePlaceholder(imageWrap) {
    imageWrap.innerHTML =
      '<div class="product-tile__placeholder">' +
      '<span class="product-tile__placeholder-icon" aria-hidden="true">🖼️</span>' +
      '<span class="product-tile__placeholder-label">Add photo</span>' +
      "</div>";
  }

  function buildProductTile(product) {
    var tile = document.createElement("button");
    tile.type = "button";
    tile.className = "product-tile";

    // Every tile reserves a picture area. When no real photo is available yet,
    // a clear "add photo" placeholder is shown so the owner can add one later.
    var imageWrap = buildImageArea(product);

    var body = document.createElement("div");
    body.className = "product-tile__body";

    var name = document.createElement("span");
    name.className = "product-tile__name";
    name.textContent = product.name;

    var price = document.createElement("span");
    price.className = "product-tile__price";

    body.appendChild(name);
    body.appendChild(price);

    if (isConfiguredMeal(product)) {
      var startingPrice = getStartingPrice(product.id);
      price.textContent = startingPrice === null
        ? "—"
        : "From " + money.formatMoney(startingPrice);
    } else {
      // Simple product: fixed price, plus a stock line only when tracked.
      price.textContent = money.formatMoney(product.sellingPrice);

      if (tracksInventory(product)) {
        var stock = document.createElement("span");
        stock.className = "product-tile__stock";
        if (product.stockQuantity <= product.lowStockLevel) {
          stock.className += " product-tile__stock--low";
          stock.textContent = "Low stock: " + product.stockQuantity + " left";
        } else {
          stock.textContent = "In stock: " + product.stockQuantity;
        }
        body.appendChild(stock);
      }
    }

    tile.appendChild(imageWrap);
    if (product.popular) {
      var badge = document.createElement("span");
      badge.className = "product-tile__badge";
      badge.textContent = "Popular";
      tile.appendChild(badge);
    }
    tile.appendChild(body);
    tile.addEventListener("click", function () {
      handleProductClick(product);
    });
    return tile;
  }

  // --- Product interaction -------------------------------------------------

  function handleProductClick(product) {
    if (isConfiguredMeal(product)) {
      openMealModal(product);
      return;
    }
    addSimpleProductToCart(product);
  }

  // --- Lookups -------------------------------------------------------------

  function findInventoryProduct(productId) {
    for (var i = 0; i < state.inventoryProducts.length; i++) {
      if (state.inventoryProducts[i].id === productId) {
        return state.inventoryProducts[i];
      }
    }
    return null;
  }

  function findExtra(extraId) {
    for (var i = 0; i < state.extras.length; i++) {
      if (state.extras[i].id === extraId) {
        return state.extras[i];
      }
    }
    return null;
  }

  function getPortionsForMeal(menuItem) {
    var list = [];
    for (var i = 0; i < state.portions.length; i++) {
      var portion = state.portions[i];
      if (portion.menuItemId === menuItem.id && portion.active &&
          menuItem.portionIds.indexOf(portion.id) !== -1) {
        list.push(portion);
      }
    }
    return list;
  }

  // --- Product contract helpers -------------------------------------------
  // Read behaviour from the new productType / trackInventory fields, falling
  // back to the legacy itemType so older stored data still works.

  function isConfiguredMeal(product) {
    if (product.productType) {
      return product.productType === "configured-meal";
    }
    return product.itemType === "configured-meal";
  }

  /** Whether a product/cart line is inventory-tracked. Never uses category or name. */
  function tracksInventory(entity) {
    if (typeof entity.trackInventory === "boolean") {
      return entity.trackInventory;
    }
    return entity.itemType === "inventory-product";
  }

  // --- Meal configuration modal -------------------------------------------
  // Holds the in-progress configuration. Rebuilt each time the modal opens so
  // no state leaks between meals. Cancelling simply discards it.
  var mealConfig = null;
  var lastFocusedTile = null;

  function openMealModal(menuItem) {
    mealConfig = { menuItem: menuItem, portion: null, protein: null, extras: {} };
    lastFocusedTile = document.activeElement;

    elements.modalMealName.textContent = menuItem.name;
    renderModalImage(menuItem);
    renderModalPortions(menuItem);
    renderModalExtras(menuItem);

    // Included and protein sections appear once a portion is chosen.
    elements.modalIncludedSection.hidden = true;
    elements.modalProteinSection.hidden = true;
    setModalError("");
    updateModalTotal();

    elements.mealModal.hidden = false;
    elements.modalClose.focus();
  }

  function closeMealModal() {
    elements.mealModal.hidden = true;
    mealConfig = null;
    if (lastFocusedTile && typeof lastFocusedTile.focus === "function") {
      lastFocusedTile.focus();
    }
  }

  function renderModalImage(menuItem) {
    elements.modalImage.innerHTML = "";
    if (menuItem.image) {
      var img = document.createElement("img");
      img.src = menuItem.image;
      img.alt = menuItem.name;
      img.addEventListener("error", function () {
        elements.modalImage.innerHTML =
          '<span class="modal__image-placeholder" aria-hidden="true">🍽️</span>';
      });
      elements.modalImage.appendChild(img);
    } else {
      elements.modalImage.innerHTML =
        '<span class="modal__image-placeholder" aria-hidden="true">🍽️</span>';
    }
  }

  function renderModalPortions(menuItem) {
    elements.modalPortions.innerHTML = "";
    var portions = getPortionsForMeal(menuItem);
    for (var i = 0; i < portions.length; i++) {
      elements.modalPortions.appendChild(buildOptionCard(
        portions[i].name,
        portions[i].includedDescription || "",
        money.formatMoney(portions[i].price),
        makePortionSelectHandler(portions[i])
      ));
    }
  }

  function makePortionSelectHandler(portion) {
    return function (card) {
      mealConfig.portion = portion;
      mealConfig.protein = null; // reset protein when the portion changes
      highlightSelected(elements.modalPortions, card);

      elements.modalIncluded.textContent = portion.includedDescription || "—";
      elements.modalIncludedSection.hidden = false;

      renderModalProteins(portion);
      setModalError("");
      updateModalTotal();
    };
  }

  /** Show only the proteins allowed for the selected portion. */
  function renderModalProteins(portion) {
    elements.modalProteins.innerHTML = "";
    var allowed = portion.allowedProteinIds || [];
    if (allowed.length === 0) {
      elements.modalProteinSection.hidden = true;
      return;
    }
    var titleSuffix = portion.proteinRequired ? "" : " (optional)";
    elements.modalProteinSection.querySelector(".modal__section-title").textContent =
      "Choose a protein" + titleSuffix;

    for (var i = 0; i < allowed.length; i++) {
      var protein = findProtein(allowed[i]);
      if (!protein || !protein.active) {
        continue;
      }
      var priceLabel = protein.additionalPrice > 0
        ? "+ " + money.formatMoney(protein.additionalPrice)
        : "Included";
      elements.modalProteins.appendChild(buildOptionCard(
        protein.name, "", priceLabel, makeProteinSelectHandler(protein)
      ));
    }
    elements.modalProteinSection.hidden = false;
  }

  function findProtein(proteinId) {
    var proteins = storage.getProteins();
    for (var i = 0; i < proteins.length; i++) {
      if (proteins[i].id === proteinId) {
        return proteins[i];
      }
    }
    return null;
  }

  function makeProteinSelectHandler(protein) {
    return function (card) {
      mealConfig.protein = protein;
      highlightSelected(elements.modalProteins, card);
      setModalError("");
      updateModalTotal();
    };
  }

  function buildOptionCard(label, desc, priceLabel, onSelect) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", "false");

    var info = document.createElement("span");
    var labelEl = document.createElement("span");
    labelEl.className = "option-card__label";
    labelEl.textContent = label;
    info.appendChild(labelEl);
    if (desc) {
      var descEl = document.createElement("span");
      descEl.className = "option-card__desc";
      descEl.textContent = desc;
      info.appendChild(document.createElement("br"));
      info.appendChild(descEl);
    }

    var priceEl = document.createElement("span");
    priceEl.className = "option-card__price";
    priceEl.textContent = priceLabel;

    card.appendChild(info);
    card.appendChild(priceEl);
    card.addEventListener("click", function () {
      onSelect(card);
    });
    return card;
  }

  function highlightSelected(container, selectedCard) {
    var cards = container.querySelectorAll(".option-card");
    for (var i = 0; i < cards.length; i++) {
      var isSel = cards[i] === selectedCard;
      cards[i].classList.toggle("option-card--selected", isSel);
      cards[i].setAttribute("aria-checked", isSel ? "true" : "false");
    }
  }

  /** Show only the extras allowed for this meal, each with +/- controls. */
  function renderModalExtras(menuItem) {
    elements.modalExtras.innerHTML = "";
    var allowed = menuItem.allowedExtraIds || [];
    if (allowed.length === 0) {
      elements.modalExtrasSection.hidden = true;
      return;
    }
    for (var i = 0; i < allowed.length; i++) {
      var extra = findExtra(allowed[i]);
      if (extra && extra.active) {
        elements.modalExtras.appendChild(buildExtraRow(extra));
      }
    }
    elements.modalExtrasSection.hidden = false;
  }

  function buildExtraRow(extra) {
    var row = document.createElement("div");
    row.className = "extra-row";

    var info = document.createElement("div");
    info.className = "extra-row__info";
    var name = document.createElement("span");
    name.className = "extra-row__name";
    name.textContent = extra.name;
    var price = document.createElement("span");
    price.className = "extra-row__price";
    price.textContent = money.formatMoney(extra.price) + " each";
    info.appendChild(name);
    info.appendChild(price);

    var stepper = document.createElement("div");
    stepper.className = "stepper";

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper__btn";
    minus.textContent = "−"; // minus sign
    minus.setAttribute("aria-label", "Remove one " + extra.name);

    var value = document.createElement("span");
    value.className = "stepper__value";
    value.setAttribute("aria-live", "polite");

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper__btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Add one " + extra.name);

    function refresh() {
      var qty = mealConfig.extras[extra.id] || 0;
      value.textContent = qty;
      minus.disabled = qty <= 0; // never negative
      plus.disabled = qty >= extra.maximumQuantity; // enforce maximum
    }

    minus.addEventListener("click", function () {
      changeExtraQty(extra, -1);
      refresh();
    });
    plus.addEventListener("click", function () {
      changeExtraQty(extra, 1);
      refresh();
    });

    stepper.appendChild(minus);
    stepper.appendChild(value);
    stepper.appendChild(plus);
    row.appendChild(info);
    row.appendChild(stepper);
    refresh();
    return row;
  }

  function changeExtraQty(extra, delta) {
    var current = mealConfig.extras[extra.id] || 0;
    var next = current + delta;
    if (next < 0) {
      next = 0; // prevent negative quantities
    }
    if (next > extra.maximumQuantity) {
      next = extra.maximumQuantity; // enforce maximum
    }
    mealConfig.extras[extra.id] = next;
    updateModalTotal();
  }

  /** Collect the chosen extras (quantity > 0) as pricing/snapshot rows. */
  function getSelectedExtras() {
    var list = [];
    for (var extraId in mealConfig.extras) {
      if (!mealConfig.extras.hasOwnProperty(extraId)) {
        continue;
      }
      var qty = mealConfig.extras[extraId];
      if (qty > 0) {
        var extra = findExtra(extraId);
        if (extra) {
          list.push({
            id: extra.id,
            name: extra.name,
            unitPrice: extra.price,
            quantity: qty,
            total: pricing.calculateLineTotal(extra.price, qty)
          });
        }
      }
    }
    return list;
  }

  /** Live unit total, always via the shared pricing helper (never inline). */
  function updateModalTotal() {
    var basePrice = mealConfig.portion ? mealConfig.portion.price : 0;
    var unitTotal = pricing.calculateConfiguredMealTotal(
      basePrice, mealConfig.protein, getSelectedExtras()
    );
    elements.modalTotal.textContent = money.formatMoney(unitTotal);
  }

  function setModalError(message) {
    elements.modalError.textContent = message;
  }

  /** Validate the configuration and add it to the cart as a snapshot. */
  function addConfiguredMealToCart() {
    if (!mealConfig.portion) {
      setModalError("Please choose a size or package.");
      return;
    }
    if (mealConfig.portion.proteinRequired && !mealConfig.protein) {
      setModalError("Please select a protein.");
      return;
    }

    var basePrice = mealConfig.portion.price;
    var extras = getSelectedExtras();
    var unitTotal = pricing.calculateConfiguredMealTotal(basePrice, mealConfig.protein, extras);
    var quantity = 1;
    var lineTotal = pricing.calculateLineTotal(unitTotal, quantity);

    // Snapshot of the completed configuration (DATABASE-DESIGN.md section 9).
    var cartItem = {
      id: createId("cart"),
      itemType: "configured-meal",
      productId: mealConfig.menuItem.id,
      productName: mealConfig.menuItem.name,
      image: mealConfig.menuItem.image,
      portion: {
        id: mealConfig.portion.id,
        name: mealConfig.portion.name,
        basePrice: basePrice
      },
      includedContents: mealConfig.portion.includedDescription || "",
      protein: mealConfig.protein
        ? {
            id: mealConfig.protein.id,
            name: mealConfig.protein.name,
            additionalPrice: mealConfig.protein.additionalPrice
          }
        : null,
      extras: extras,
      unitTotal: unitTotal,
      quantity: quantity,
      lineTotal: lineTotal
    };
    state.cart.push(cartItem);

    // Each configuration is its own cart line (never merged with another).
    persistAndRenderCart(cartItem.id);
    var name = mealConfig.menuItem.name;
    closeMealModal();
    showToast(name + " added to cart.");
  }

  /**
   * Add an inventory product to the cart. Identical products combine into one
   * line. Quantity can never exceed available stock (validation layer).
   */
  function addSimpleProductToCart(product) {
    var existing = null;
    for (var i = 0; i < state.cart.length; i++) {
      if (state.cart[i].productId === product.id) {
        existing = state.cart[i];
        break;
      }
    }

    var requested = existing ? existing.quantity + 1 : 1;
    // Stock is enforced only when the product's inventory is tracked.
    if (tracksInventory(product)) {
      var stockCheck = validation.validateStockAvailable(product.stockQuantity, requested);
      if (!stockCheck.valid) {
        showToast(stockCheck.message);
        return;
      }
    }

    var changedItem;
    if (existing) {
      existing.quantity = requested;
      existing.lineTotal = pricing.calculateLineTotal(existing.unitPrice, existing.quantity);
      changedItem = existing;
    } else {
      changedItem = {
        id: createId("cart"),
        itemType: "inventory-product",
        productId: product.id,
        productName: product.name,
        image: product.image,
        unitPrice: product.sellingPrice,
        trackInventory: tracksInventory(product),
        quantity: 1,
        lineTotal: pricing.calculateLineTotal(product.sellingPrice, 1)
      };
      state.cart.push(changedItem);
    }

    persistAndRenderCart(changedItem.id);
    showToast(product.name + " added to cart.");
  }

  function removeCartItem(cartItemId) {
    state.cart = state.cart.filter(function (item) {
      return item.id !== cartItemId;
    });
    persistAndRenderCart();
  }

  /**
   * Increase or decrease a cart line's quantity by one. Dropping below 1 removes
   * the line. Inventory items are capped at their available stock.
   */
  function changeCartQuantity(item, delta) {
    var newQty = item.quantity + delta;
    if (newQty < 1) {
      removeCartItem(item.id);
      return;
    }
    if (tracksInventory(item)) {
      var product = findInventoryProduct(item.productId);
      if (product) {
        var check = validation.validateStockAvailable(product.stockQuantity, newQty);
        if (!check.valid) {
          showToast(check.message);
          return;
        }
      }
    }
    // Per-unit price is the meal unit total for meals, or the unit price.
    var unitPrice = (typeof item.unitTotal === "number") ? item.unitTotal : item.unitPrice;
    item.quantity = newQty;
    item.lineTotal = pricing.calculateLineTotal(unitPrice, newQty);
    persistAndRenderCart(item.id);
  }

  function bindPosEvents() {
    elements.productSearch.addEventListener("input", renderProducts);
  }

  function persistAndRenderCart(highlightItemId) {
    storage.saveCurrentCart(state.cart);
    renderCart(highlightItemId);
  }

  // --- Rendering: cart -----------------------------------------------------

  function renderCart(highlightItemId) {
    elements.cartItems.innerHTML = "";

    var empty = validation.isCartEmpty(state.cart);
    elements.cartEmpty.hidden = !empty;

    for (var i = 0; i < state.cart.length; i++) {
      var line = buildCartLine(state.cart[i]);
      if (state.cart[i].id === highlightItemId) {
        line.className += " cart-item--highlight";
        global.setTimeout(function (highlightedLine) {
          highlightedLine.classList.remove("cart-item--highlight");
        }, 700, line);
      }
      elements.cartItems.appendChild(line);
    }

    var itemCount = state.cart.reduce(function (count, item) {
      return count + Number(item.quantity || 0);
    }, 0);
    elements.cartCount.textContent = itemCount;
    elements.cartCount.setAttribute("aria-label", itemCount + (itemCount === 1 ? " item" : " items"));

    var subtotal = pricing.calculateCartSubtotal(state.cart);
    var total = pricing.calculateSaleTotal(subtotal, 0);
    elements.cartSubtotal.textContent = money.formatMoney(subtotal);
    elements.cartTotal.textContent = money.formatMoney(total);
    elements.checkoutButton.disabled = empty; // no checkout with an empty cart
  }

  function buildCartLine(item) {
    var li = document.createElement("li");
    li.className = "cart-item";

    var topRow = document.createElement("div");
    topRow.className = "cart-item__row";

    var name = document.createElement("span");
    name.className = "cart-item__name";
    // Configured meals show the meal name plus the chosen portion/package.
    name.textContent = (isConfiguredMeal(item) && item.portion)
      ? item.productName + " — " + item.portion.name
      : item.productName;

    var lineTotal = document.createElement("span");
    lineTotal.className = "cart-item__line-total";
    lineTotal.textContent = money.formatMoney(item.lineTotal);

    topRow.appendChild(name);
    topRow.appendChild(lineTotal);
    li.appendChild(topRow);

    // Configuration details (protein, extras) for configured meals.
    if (isConfiguredMeal(item)) {
      if (item.protein) {
        li.appendChild(buildMetaLine("Protein: " + item.protein.name));
      }
      if (item.extras && item.extras.length) {
        var extrasText = item.extras.map(function (extra) {
          return extra.name + " × " + extra.quantity;
        }).join(", ");
        li.appendChild(buildMetaLine("Extras: " + extrasText));
      }
      li.appendChild(buildMetaLine(money.formatMoney(item.unitTotal) + " each"));
    } else {
      li.appendChild(buildMetaLine(money.formatMoney(item.unitPrice) + " each"));
    }

    // Quantity stepper + remove.
    var controls = document.createElement("div");
    controls.className = "cart-item__controls";

    var stepper = document.createElement("div");
    stepper.className = "cart-item__stepper";

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "cart-item__step";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Reduce quantity");
    minus.addEventListener("click", function () {
      changeCartQuantity(item, -1);
    });

    var qty = document.createElement("span");
    qty.className = "cart-item__qty";
    qty.textContent = item.quantity;

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "cart-item__step";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase quantity");
    plus.addEventListener("click", function () {
      changeCartQuantity(item, 1);
    });

    stepper.appendChild(minus);
    stepper.appendChild(qty);
    stepper.appendChild(plus);

    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn--danger";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", function () {
      removeCartItem(item.id);
    });

    controls.appendChild(stepper);
    controls.appendChild(removeButton);
    li.appendChild(controls);
    return li;
  }

  function buildMetaLine(text) {
    var meta = document.createElement("div");
    meta.className = "cart-item__meta";
    meta.textContent = text;
    return meta;
  }

  // --- Product & inventory management -------------------------------------
  // Access is enforced by nav filtering (Products/Inventory only appear for
  // supervisor + admin) and re-checked below. Cashiers can never reach these.

  var editingProductId = null;
  var formImage = ""; // current image (data URI or path); "" means none
  var inventoryFilter = "all";
  var currentInventorySummary = null;
  var currentInventoryProducts = [];

  function bindManageEvents() {
    elements.manageClose.addEventListener("click", closeManagementPage);
    elements.inventoryReportSearch.addEventListener("input", renderInventoryReportTable);
    elements.inventoryReportFilters.addEventListener("click", function (event) {
      var button = event.target.closest("[data-filter]");
      if (!button) { return; }
      inventoryFilter = button.getAttribute("data-filter");
      var buttons = elements.inventoryReportFilters.querySelectorAll("[data-filter]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle("inventory-filter--active", buttons[i] === button);
      }
      renderInventoryReportTable();
    });
    elements.inventoryPrint.addEventListener("click", function () {
      printInventoryReport(elements.inventoryPrintSize.value);
    });
    elements.inventoryExportPdf.addEventListener("click", downloadInventoryReportPdf);
    elements.manageAdd.addEventListener("click", function () {
      openProductForm(null);
    });
    elements.pfType.addEventListener("change", updateFormVisibility);
    elements.pfTrack.addEventListener("change", updateFormVisibility);
    elements.pfChoose.addEventListener("click", function () {
      elements.pfFile.click();
    });
    elements.pfFile.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      handleImageFile(file);
      event.target.value = ""; // allow re-picking the same file
    });
    elements.pfRemove.addEventListener("click", function () {
      setFormImage("");
    });
    elements.pfSave.addEventListener("click", saveProductForm);
    elements.pfCancel.addEventListener("click", closeProductForm);
    elements.productClose.addEventListener("click", closeProductForm);
    elements.productOverlay.addEventListener("click", closeProductForm);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.productModal.hidden && elements.extrasModal.hidden) {
        closeProductForm();
      }
    });

    // Menu editor: packages + extras library
    elements.pfAddPackage.addEventListener("click", function () {
      elements.pfPackagesList.appendChild(buildPackageRow(null));
    });
    elements.pfManageExtras.addEventListener("click", openExtrasEditor);
    elements.extrasAdd.addEventListener("click", function () {
      elements.extrasEditorList.appendChild(buildExtraEditRow(null));
    });
    elements.extrasSave.addEventListener("click", saveExtrasLibrary);
    elements.extrasCancel.addEventListener("click", closeExtrasEditor);
    elements.extrasClose.addEventListener("click", closeExtrasEditor);
    elements.extrasOverlay.addEventListener("click", closeExtrasEditor);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.extrasModal.hidden) {
        closeExtrasEditor();
      }
    });
  }

  function closeManagementPage() {
    if (!elements.productModal.hidden) {
      showToast("Close or cancel the product form first.");
      return;
    }
    showSection("pos");
  }

  function canManage() {
    return !!currentUser &&
      (auth.canAccess(currentUser.role, "products") ||
       auth.canAccess(currentUser.role, "inventory"));
  }

  function renderManageScreen(key) {
    var isInventory = (key === "inventory");
    elements.manageTitle.textContent = isInventory ? "Inventory & Stock" : "Products";
    elements.manageAdd.hidden = isInventory; // the stock view does not add products
    elements.inventoryPrintFormat.hidden = !isInventory;
    elements.inventoryPrint.hidden = !isInventory;
    elements.inventoryExportPdf.hidden = !isInventory;
    elements.inventoryReport.hidden = !isInventory;
    elements.manageHint.textContent = isInventory
      ? "Update stock for inventory-tracked products."
      : "Add or edit products. Configured meals are priced by their portions.";
    if (isInventory) { renderInventoryReport(); }
    renderManageList(key);
  }

  function renderInventoryReport() {
    if (!currentUser || !auth.canAccess(currentUser.role, "inventory")) {
      showToast("You do not have access to Inventory.");
      showSection("pos");
      return false;
    }
    currentInventorySummary = inventoryReport.getSummary();
    var settings = state.settings || {};
    renderLogo(elements.inventoryReportLogo, settings);
    elements.inventoryReportBusiness.textContent = settings.businessName || "Business Report";
    setReportBusinessDetail(elements.inventoryReportPhone, "Telephone", settings.phone);
    setReportBusinessDetail(elements.inventoryReportAddress, "Address", settings.address);
    elements.inventoryReportGenerated.textContent = "Generated: " + reports.formatDateTime(new Date());
    elements.inventoryTotalProducts.textContent = String(currentInventorySummary.totalProducts);
    elements.inventoryTotalUnits.textContent = String(currentInventorySummary.totalUnits);
    elements.inventoryLowCount.textContent = String(currentInventorySummary.lowStockCount);
    elements.inventoryOutCount.textContent = String(currentInventorySummary.outOfStockCount);
    renderInventoryReportTable();
    return true;
  }

  function renderInventoryReportTable() {
    if (!currentInventorySummary) { return; }
    var search = elements.inventoryReportSearch.value;
    currentInventoryProducts = inventoryReport.filterProducts(
      currentInventorySummary.products,
      inventoryFilter,
      search
    );
    var filterLabels = { all: "All products", low: "Low Stock", out: "Out of Stock" };
    var context = "Filter: " + filterLabels[inventoryFilter];
    if (search.trim()) { context += " | Search: " + search.trim(); }
    elements.inventoryReportContext.textContent = context;
    elements.inventoryReportTable.innerHTML = "";
    if (!currentInventoryProducts.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 4;
      emptyCell.className = "inventory-table__empty";
      emptyCell.textContent = "No inventory products match this filter.";
      emptyRow.appendChild(emptyCell);
      elements.inventoryReportTable.appendChild(emptyRow);
      return;
    }
    for (var i = 0; i < currentInventoryProducts.length; i++) {
      var product = currentInventoryProducts[i];
      var row = document.createElement("tr");
      appendInventoryCell(row, "Product name", product.name);
      appendInventoryCell(row, "Current stock", String(product.stockQuantity));
      appendInventoryCell(row, "Low-stock threshold", String(product.lowStockLevel));
      var statusCell = appendInventoryCell(row, "Status", inventoryStatusLabel(product.status));
      statusCell.firstChild.className = "inventory-status inventory-status--" + product.status;
      elements.inventoryReportTable.appendChild(row);
    }
  }

  function appendInventoryCell(row, label, value) {
    var cell = document.createElement("td");
    cell.setAttribute("data-label", label);
    var content = document.createElement("span");
    content.textContent = value;
    cell.appendChild(content);
    row.appendChild(cell);
    return cell;
  }

  function inventoryStatusLabel(status) {
    return status === "out" ? "Out of Stock" : status === "low" ? "Low Stock" : "In Stock";
  }

  function printInventoryReport(format) {
    if (!renderInventoryReport()) { return; }
    document.body.classList.add("printing-inventory");
    document.body.classList.add(format === "58mm" ? "inventory-print-58" :
      format === "a4" ? "inventory-print-a4" : "inventory-print-80");
    window.print();
  }

  function downloadInventoryReportPdf() {
    if (!renderInventoryReport() || !currentInventorySummary) { return; }
    var blob = inventoryReportPdf.createPdf(
      currentInventorySummary,
      currentInventoryProducts,
      state.settings || {},
      elements.inventoryReportGenerated.textContent,
      elements.inventoryReportContext.textContent
    );
    var downloadUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "inventory-report.pdf";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
    showToast("Inventory PDF downloaded.");
  }

  function renderManageList(key) {
    elements.manageList.innerHTML = "";
    var products = storage.getProducts();
    if (key === "inventory") {
      products = products.filter(function (p) { return tracksInventory(p); });
    }
    if (products.length === 0) {
      var empty = document.createElement("p");
      empty.className = "cart__empty";
      empty.textContent = "No products to show.";
      elements.manageList.appendChild(empty);
      return;
    }
    for (var i = 0; i < products.length; i++) {
      elements.manageList.appendChild(buildManageRow(products[i], key));
    }
  }

  function buildManageRow(product, key) {
    var row = document.createElement("div");
    row.className = "manage-row";

    var thumb = document.createElement("div");
    thumb.className = "manage-row__thumb";
    if (product.image) {
      var img = document.createElement("img");
      img.src = product.image;
      img.alt = product.name;
      img.addEventListener("error", function () { thumb.textContent = "🍽️"; });
      thumb.appendChild(img);
    } else {
      thumb.textContent = "🍽️";
    }

    var info = document.createElement("div");
    info.className = "manage-row__info";
    var name = document.createElement("div");
    name.className = "manage-row__name";
    name.textContent = product.name + (product.active === false ? " (inactive)" : "");
    var meta = document.createElement("div");
    meta.className = "manage-row__meta";
    if (isConfiguredMeal(product)) {
      meta.textContent = "Configured meal · priced by portions";
    } else {
      var text = "Simple · " + money.formatMoney(product.sellingPrice);
      if (tracksInventory(product)) {
        text += " · Stock: " + product.stockQuantity;
      }
      meta.textContent = text;
    }
    info.appendChild(name);
    info.appendChild(meta);

    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn--secondary";
    edit.textContent = (key === "inventory") ? "Update stock" : "Edit";
    edit.addEventListener("click", function () { openProductForm(product); });

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(edit);
    return row;
  }

  function findProductById(id) {
    var i;
    for (i = 0; i < state.menuItems.length; i++) {
      if (state.menuItems[i].id === id) { return state.menuItems[i]; }
    }
    for (i = 0; i < state.inventoryProducts.length; i++) {
      if (state.inventoryProducts[i].id === id) { return state.inventoryProducts[i]; }
    }
    return null;
  }

  // --- Product form --------------------------------------------------------

  function openProductForm(product) {
    if (!canManage()) {
      showToast("You do not have access to manage products.");
      return;
    }
    editingProductId = product ? product.id : null;
    populateCategoryOptions();
    elements.productModalTitle.textContent = product ? "Edit product" : "Add product";
    setFormError("");

    if (product) {
      elements.pfName.value = product.name || "";
      elements.pfCategory.value = product.categoryId || "";
      elements.pfType.value = isConfiguredMeal(product) ? "configured-meal" : "simple";
      elements.pfType.disabled = true; // type is fixed on edit (protects portions)
      elements.pfPrice.value = (typeof product.sellingPrice === "number") ? product.sellingPrice : "";
      elements.pfTrack.checked = tracksInventory(product);
      elements.pfStock.value = (product.stockQuantity == null) ? "" : product.stockQuantity;
      elements.pfLow.value = (product.lowStockLevel == null) ? "" : product.lowStockLevel;
      elements.pfActive.checked = product.active !== false;
      setFormImage(product.image || "");
    } else {
      elements.pfName.value = "";
      elements.pfCategory.selectedIndex = 0;
      elements.pfType.value = "simple";
      elements.pfType.disabled = false;
      elements.pfPrice.value = "";
      elements.pfTrack.checked = false;
      elements.pfStock.value = "";
      elements.pfLow.value = "";
      elements.pfActive.checked = true;
      setFormImage("");
    }
    renderPackages(product);
    renderExtrasChecklist(product ? (product.allowedExtraIds || []) : []);
    updateFormVisibility();
    elements.productModal.hidden = false;
    elements.pfName.focus();
  }

  function closeProductForm() {
    elements.productModal.hidden = true;
    editingProductId = null;
    formImage = "";
  }

  function populateCategoryOptions() {
    elements.pfCategory.innerHTML = "";
    var cats = state.categories.slice().sort(function (a, b) {
      return a.displayOrder - b.displayOrder;
    });
    for (var i = 0; i < cats.length; i++) {
      if (!cats[i].active) { continue; }
      var option = document.createElement("option");
      option.value = cats[i].id;
      option.textContent = cats[i].name;
      elements.pfCategory.appendChild(option);
    }
  }

  /** Show/hide price/stock (simple) vs packages/extras (meal) per type. */
  function updateFormVisibility() {
    var isMeal = elements.pfType.value === "configured-meal";
    // Configured meals: no selling price here, never inventory-tracked.
    elements.pfMealNote.hidden = !isMeal;
    elements.pfPriceField.hidden = isMeal;
    elements.pfTrackField.hidden = isMeal;
    // Packages + allowed extras only apply to configured meals.
    elements.pfPackagesSection.hidden = !isMeal;
    elements.pfExtrasSection.hidden = !isMeal;
    if (isMeal) {
      elements.pfTrack.checked = false;
    }
    var showStock = !isMeal && elements.pfTrack.checked;
    elements.pfStockField.hidden = !showStock;
    elements.pfLowField.hidden = !showStock;
  }

  function setFormError(message) {
    elements.pfError.textContent = message;
  }

  function saveProductForm() {
    if (!canManage()) {
      showToast("You do not have access to manage products.");
      return;
    }
    var name = elements.pfName.value.trim();
    if (!name) {
      setFormError("Enter a product name.");
      return;
    }
    var categoryId = elements.pfCategory.value;
    if (!categoryId) {
      setFormError("Choose a category.");
      return;
    }

    var type = elements.pfType.value;
    var isMeal = type === "configured-meal";
    var existing = editingProductId ? findProductById(editingProductId) : null;

    var product = {
      id: editingProductId || createId(isMeal ? "meal" : "product"),
      name: name,
      categoryId: categoryId,
      productType: type,
      itemType: isMeal ? "configured-meal" : "inventory-product", // legacy compat
      image: formImage,
      active: elements.pfActive.checked
    };

    var mealPortions = null;
    if (isMeal) {
      // Meals: never inventory; priced by their packages (portions) below.
      product.trackInventory = false;
      product.stockQuantity = null;
      product.lowStockLevel = null;
      if (existing && existing.description) { product.description = existing.description; }

      var collected = collectPackages(product.id);
      if (collected.error) {
        setFormError(collected.error);
        return;
      }
      mealPortions = collected.portions;
      product.portionIds = mealPortions.map(function (portion) { return portion.id; });
      product.allowedExtraIds = collectCheckedExtras();
    } else {
      if (!validation.isValidPrice(elements.pfPrice.value) || elements.pfPrice.value === "") {
        setFormError("Enter a valid selling price (a number, 0 or more).");
        return;
      }
      product.sellingPrice = money.roundMoney(Number(elements.pfPrice.value));

      var track = elements.pfTrack.checked;
      product.trackInventory = track;
      if (track) {
        if (!validation.isNonNegativeInteger(elements.pfStock.value)) {
          setFormError("Enter a valid stock quantity (whole number, 0 or more).");
          return;
        }
        if (!validation.isNonNegativeInteger(elements.pfLow.value)) {
          setFormError("Enter a valid low-stock level (whole number, 0 or more).");
          return;
        }
        product.stockQuantity = Number(elements.pfStock.value);
        product.lowStockLevel = Number(elements.pfLow.value);
      } else {
        product.stockQuantity = null;
        product.lowStockLevel = null;
      }
    }

    storage.saveProduct(product);
    if (isMeal) {
      persistMealPortions(product.id, mealPortions);
    }
    reloadCatalogue();          // refresh in-memory data + POS grid
    closeProductForm();
    renderManageScreen(activeNavKey); // refresh the management list
    showToast("Product saved.");
  }

  // --- Menu editor: packages (portions) ------------------------------------

  /** Render the meal's packages as editable rows (empty for a new meal). */
  function renderPackages(product) {
    elements.pfPackagesList.innerHTML = "";
    if (!product || !isConfiguredMeal(product)) {
      return;
    }
    var portions = getPortionsForMeal(product);
    for (var i = 0; i < portions.length; i++) {
      elements.pfPackagesList.appendChild(buildPackageRow(portions[i]));
    }
  }

  function buildPackageRow(portion) {
    var row = document.createElement("div");
    row.className = "pkg-row";
    if (portion && portion.id) {
      row.setAttribute("data-portion-id", portion.id);
    }

    var grid = document.createElement("div");
    grid.className = "pkg-row__grid";
    var nameInput = document.createElement("input");
    nameInput.className = "field__input pkg-row__name";
    nameInput.type = "text";
    nameInput.placeholder = "Package name (e.g. Regular)";
    nameInput.value = portion ? (portion.name || "") : "";
    var priceInput = document.createElement("input");
    priceInput.className = "field__input pkg-row__price";
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.inputMode = "decimal";
    priceInput.placeholder = "Price";
    priceInput.value = portion && typeof portion.price === "number" ? portion.price : "";
    grid.appendChild(nameInput);
    grid.appendChild(priceInput);

    var included = document.createElement("input");
    included.className = "field__input pkg-row__included";
    included.type = "text";
    included.placeholder = "Included (e.g. 3 scoops, 1 protein)";
    included.value = portion ? (portion.includedDescription || "") : "";

    var foot = document.createElement("div");
    foot.className = "pkg-row__foot";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn--danger pkg-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", function () { row.remove(); });
    foot.appendChild(remove);

    row.appendChild(grid);
    row.appendChild(included);
    row.appendChild(foot);
    return row;
  }

  /** Read the package rows into portion objects, validating each. */
  function collectPackages(mealId) {
    var rows = elements.pfPackagesList.querySelectorAll(".pkg-row");
    var portions = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var name = row.querySelector(".pkg-row__name").value.trim();
      var priceValue = row.querySelector(".pkg-row__price").value;
      var included = row.querySelector(".pkg-row__included").value.trim();
      if (!name) {
        return { error: "Every package needs a name (package " + (i + 1) + ")." };
      }
      if (!validation.isValidPrice(priceValue) || priceValue === "") {
        return { error: "Enter a valid price for \"" + name + "\" (0 or more)." };
      }
      portions.push({
        id: row.getAttribute("data-portion-id") || createId("portion"),
        menuItemId: mealId,
        name: name,
        price: money.roundMoney(Number(priceValue)),
        includedDescription: included,
        proteinRequired: false,
        allowedProteinIds: [],
        active: true
      });
    }
    return { portions: portions };
  }

  /** Replace just this meal's portions in storage, keeping other meals' intact. */
  function persistMealPortions(mealId, portions) {
    var others = storage.getPortions().filter(function (portion) {
      return portion.menuItemId !== mealId;
    });
    storage.savePortions(others.concat(portions));
  }

  // --- Menu editor: allowed extras (per meal) ------------------------------

  function renderExtrasChecklist(selectedIds) {
    elements.pfExtrasList.innerHTML = "";
    var selected = {};
    (selectedIds || []).forEach(function (id) { selected[id] = true; });
    var extras = storage.getExtras();
    if (extras.length === 0) {
      var empty = document.createElement("p");
      empty.className = "field__note";
      empty.textContent = "No extras yet. Use \"Manage extras…\" to add some.";
      elements.pfExtrasList.appendChild(empty);
      return;
    }
    for (var i = 0; i < extras.length; i++) {
      elements.pfExtrasList.appendChild(buildExtraCheckbox(extras[i], !!selected[extras[i].id]));
    }
  }

  function buildExtraCheckbox(extra, checked) {
    var label = document.createElement("label");
    label.className = "extras-check";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.value = extra.id;
    input.checked = checked;
    var text = document.createElement("span");
    text.textContent = extra.name + " (" + money.formatMoney(extra.price) + ")";
    label.appendChild(input);
    label.appendChild(text);
    return label;
  }

  function collectCheckedExtras() {
    var boxes = elements.pfExtrasList.querySelectorAll("input[type=checkbox]:checked");
    return Array.prototype.map.call(boxes, function (box) { return box.value; });
  }

  // --- Extras library modal (shared across meals) --------------------------

  function openExtrasEditor() {
    if (!canManage()) {
      showToast("You do not have access to manage extras.");
      return;
    }
    setExtrasError("");
    renderExtrasEditor(storage.getExtras());
    elements.extrasModal.hidden = false;
  }

  function closeExtrasEditor() {
    elements.extrasModal.hidden = true;
  }

  function setExtrasError(message) {
    elements.extrasError.textContent = message;
  }

  function renderExtrasEditor(extras) {
    elements.extrasEditorList.innerHTML = "";
    for (var i = 0; i < extras.length; i++) {
      elements.extrasEditorList.appendChild(buildExtraEditRow(extras[i]));
    }
  }

  function buildExtraEditRow(extra) {
    var row = document.createElement("div");
    row.className = "extra-edit-row";
    if (extra && extra.id) {
      row.setAttribute("data-extra-id", extra.id);
    }

    var name = document.createElement("input");
    name.className = "field__input extra-edit-row__name";
    name.type = "text";
    name.placeholder = "Extra name";
    name.value = extra ? (extra.name || "") : "";

    var price = document.createElement("input");
    price.className = "field__input extra-edit-row__price";
    price.type = "number";
    price.min = "0";
    price.step = "0.01";
    price.inputMode = "decimal";
    price.placeholder = "Price";
    price.value = extra && typeof extra.price === "number" ? extra.price : "";

    var max = document.createElement("input");
    max.className = "field__input extra-edit-row__max";
    max.type = "number";
    max.min = "1";
    max.step = "1";
    max.inputMode = "numeric";
    max.placeholder = "Max";
    max.value = extra && typeof extra.maximumQuantity === "number" ? extra.maximumQuantity : "";
    max.title = "Maximum quantity per order";

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn--danger extra-edit-row__remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", function () { row.remove(); });

    row.appendChild(name);
    row.appendChild(price);
    row.appendChild(max);
    row.appendChild(remove);
    return row;
  }

  function saveExtrasLibrary() {
    if (!canManage()) {
      showToast("You do not have access to manage extras.");
      return;
    }
    var rows = elements.extrasEditorList.querySelectorAll(".extra-edit-row");
    var extras = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var name = row.querySelector(".extra-edit-row__name").value.trim();
      var priceValue = row.querySelector(".extra-edit-row__price").value;
      var maxValue = row.querySelector(".extra-edit-row__max").value;
      if (!name) {
        setExtrasError("Every extra needs a name (row " + (i + 1) + ").");
        return;
      }
      if (!validation.isValidPrice(priceValue) || priceValue === "") {
        setExtrasError("Enter a valid price for \"" + name + "\" (0 or more).");
        return;
      }
      if (!validation.isPositiveInteger(maxValue)) {
        setExtrasError("Enter a maximum quantity of 1 or more for \"" + name + "\".");
        return;
      }
      extras.push({
        id: row.getAttribute("data-extra-id") || createId("extra"),
        name: name,
        price: money.roundMoney(Number(priceValue)),
        maximumQuantity: Number(maxValue),
        active: true
      });
    }
    storage.saveExtras(extras);
    state.extras = extras;
    // Keep any ticks the user already made in the product form, then refresh.
    if (!elements.productModal.hidden) {
      renderExtrasChecklist(collectCheckedExtras());
    }
    closeExtrasEditor();
    showToast("Extras saved.");
  }

  /** Re-read the catalogue from storage and refresh POS rendering. */
  function reloadCatalogue() {
    state.categories = storage.getCategories();
    state.menuItems = storage.getMenuItems();
    state.portions = storage.getPortions();
    state.inventoryProducts = storage.getInventoryProducts();
    state.extras = storage.getExtras();
    renderCategories();
    renderProducts();
  }

  // --- Image upload (validate, compress, preview) --------------------------

  var MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
  var ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function setFormImage(value) {
    formImage = value || "";
    elements.pfPreview.innerHTML = "";
    if (formImage) {
      var img = document.createElement("img");
      img.src = formImage;
      img.alt = "Product image preview";
      elements.pfPreview.appendChild(img);
      elements.pfChoose.textContent = "Replace image";
      elements.pfRemove.hidden = false;
    } else {
      var span = document.createElement("span");
      span.className = "image-picker__empty";
      span.textContent = "No image";
      elements.pfPreview.appendChild(span);
      elements.pfChoose.textContent = "Choose image";
      elements.pfRemove.hidden = true;
    }
  }

  function handleImageFile(file) {
    if (!file) {
      return;
    }
    if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
      setFormError("Unsupported image type. Use JPG, PNG, WebP or GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError("Image is too large. Maximum size is 5 MB.");
      return;
    }
    setFormError("");
    compressImage(file, function (error, dataUrl) {
      if (error) {
        setFormError("Could not read that image. Please try another file.");
        return;
      }
      setFormImage(dataUrl);
    });
  }

  /**
   * Compress an image by scaling it to at most 600px on its longest side and
   * re-encoding as JPEG, so stored data URIs stay small.
   */
  function compressImage(file, callback) {
    var reader = new FileReader();
    reader.onload = function (event) {
      var img = new Image();
      img.onload = function () {
        var maxDim = 600;
        var w = img.width;
        var h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          } else {
            w = Math.round(w * (maxDim / h));
            h = maxDim;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try {
          callback(null, canvas.toDataURL("image/jpeg", 0.7));
        } catch (ex) {
          callback(ex);
        }
      };
      img.onerror = function () { callback(new Error("decode failed")); };
      img.src = event.target.result;
    };
    reader.onerror = function () { callback(new Error("read failed")); };
    reader.readAsDataURL(file);
  }

  // --- Daily reports ------------------------------------------------------

  var currentReportSummary = null;
  var currentReportPeriodTitle = "";

  function bindReportEvents() {
    var todayDisplay = reports.formatDateKey(reports.todayKey());
    elements.reportsFromDate.value = todayDisplay;
    elements.reportsToDate.value = todayDisplay;
    elements.reportsFromNative.value = reports.todayKey();
    elements.reportsToNative.value = reports.todayKey();
    elements.reportsApply.addEventListener("click", renderReports);
    elements.reportsPrint.addEventListener("click", function () {
      printReport(elements.reportsPrintSize.value);
    });
    elements.reportsExportPdf.addEventListener("click", function () {
      downloadReportPdf();
    });
    bindReportCalendar(elements.reportsFromCalendar, elements.reportsFromNative, elements.reportsFromDate);
    bindReportCalendar(elements.reportsToCalendar, elements.reportsToNative, elements.reportsToDate);
    elements.reportsFromDate.addEventListener("keydown", applyReportDatesOnEnter);
    elements.reportsToDate.addEventListener("keydown", applyReportDatesOnEnter);
    window.addEventListener("afterprint", clearReportPrintMode);
  }

  function bindReportCalendar(button, nativeInput, displayInput) {
    button.addEventListener("click", function () {
      var currentKey = reports.displayDateToKey(displayInput.value);
      if (currentKey) { nativeInput.value = currentKey; }
      if (typeof nativeInput.showPicker === "function") {
        nativeInput.showPicker();
      } else {
        nativeInput.click();
      }
    });
    nativeInput.addEventListener("change", function () {
      if (nativeInput.value) {
        displayInput.value = reports.formatDateKey(nativeInput.value);
        renderReports();
      }
    });
  }

  function applyReportDatesOnEnter(event) {
    if (event.key === "Enter") { renderReports(); }
  }

  function renderReports() {
    if (!currentUser || !auth.canAccess(currentUser.role, "reports")) {
      showToast("You do not have access to Reports.");
      showSection("pos");
      return;
    }
    var fromDateKey = reports.displayDateToKey(elements.reportsFromDate.value);
    var toDateKey = reports.displayDateToKey(elements.reportsToDate.value);
    if (!fromDateKey || !toDateKey) {
      elements.reportsError.textContent = "Enter both dates as DD-MM-YYYY.";
      return false;
    }
    if (fromDateKey > toDateKey) {
      elements.reportsError.textContent = "From date cannot be later than To date.";
      return false;
    }
    elements.reportsError.textContent = "";
    var summary = reports.getSalesSummary(fromDateKey, toDateKey);
    var fromDisplay = reports.formatDateKey(fromDateKey);
    var toDisplay = reports.formatDateKey(toDateKey);
    elements.reportsFromDate.value = fromDisplay;
    elements.reportsToDate.value = toDisplay;
    elements.reportsFromNative.value = fromDateKey;
    elements.reportsToNative.value = toDateKey;
    elements.reportsPeriodTitle.textContent = fromDateKey === toDateKey
      ? "Daily Report — " + fromDisplay
      : "Report — " + fromDisplay + " to " + toDisplay;
    elements.reportsGenerated.textContent = "Generated: " + reports.formatDateTime(new Date());
    currentReportSummary = summary;
    currentReportPeriodTitle = elements.reportsPeriodTitle.textContent;
    renderReportBranding();

    elements.reportsRevenue.textContent = money.formatMoney(summary.totalRevenue);
    elements.reportsCount.textContent = String(summary.transactionCount);
    elements.reportsCash.textContent = money.formatMoney(summary.cashTotal);
    elements.reportsMomo.textContent = money.formatMoney(summary.momoTotal);
    elements.reportsBestSeller.textContent = summary.bestSeller
      ? summary.bestSeller.name + " · " + summary.bestSeller.quantity + " sold"
      : "No items sold.";

    renderReportRows(elements.reportsProducts, summary.productsSold, function (product) {
      return { label: product.name, value: product.quantity + " sold" };
    }, "No products or meals were sold in this period.");

    renderReportRows(elements.reportsLowStock, summary.lowStockProducts, function (product) {
      return {
        label: product.name || "Unnamed product",
        value: "Stock " + product.stockQuantity + " · Low at " + product.lowStockLevel
      };
    }, "No products are currently low in stock.");
    return true;
  }

  function renderReportBranding() {
    var settings = state.settings || {};
    renderLogo(elements.reportsPrintLogo, settings);
    elements.reportsBusinessName.textContent = settings.businessName || "Business Report";
    setReportBusinessDetail(elements.reportsBusinessPhone, "Telephone", settings.phone);
    setReportBusinessDetail(elements.reportsBusinessAddress, "Address", settings.address);
  }

  function setReportBusinessDetail(element, label, value) {
    element.hidden = !value;
    element.textContent = value ? label + ": " + value : "";
  }

  function printReport(format) {
    if (!renderReports()) { return; }
    document.body.classList.add("printing-report");
    document.body.classList.add(format === "58mm" ? "report-print-58" :
      format === "a4" ? "report-print-a4" : "report-print-80");
    window.print();
  }

  function downloadReportPdf() {
    if (!renderReports() || !currentReportSummary) { return; }
    var blob = reportPdf.createPdf(
      currentReportSummary,
      state.settings || {},
      currentReportPeriodTitle,
      elements.reportsGenerated.textContent,
      money.formatMoney
    );
    var downloadUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "sales-report-" + currentReportSummary.fromDateKey + "-to-" + currentReportSummary.toDateKey + ".pdf";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
    showToast("PDF report downloaded.");
  }

  function clearReportPrintMode() {
    document.body.classList.remove("printing-report", "report-print-58", "report-print-80", "report-print-a4");
    document.body.classList.remove("printing-inventory", "inventory-print-58", "inventory-print-80", "inventory-print-a4");
  }

  function renderReportRows(container, items, mapItem, emptyMessage) {
    container.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "report-panel__empty";
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }
    var list = document.createElement("ul");
    list.className = "report-list";
    for (var i = 0; i < items.length; i++) {
      var content = mapItem(items[i]);
      var row = document.createElement("li");
      row.className = "report-list__row";
      var label = document.createElement("span");
      label.textContent = content.label;
      var value = document.createElement("strong");
      value.textContent = content.value;
      row.appendChild(label);
      row.appendChild(value);
      list.appendChild(row);
    }
    container.appendChild(list);
  }

  // --- Admin users and settings ------------------------------------------

  var editingUserId = null;
  var settingsLogo = "";
  var selectedBackup = null;

  function isAdmin() {
    return !!currentUser && currentUser.role === "admin";
  }

  function bindAdminEvents() {
    elements.userAdd.addEventListener("click", function () { openUserForm(null); });
    elements.userSave.addEventListener("click", saveUserForm);
    elements.userCancel.addEventListener("click", closeUserForm);
    elements.userClose.addEventListener("click", closeUserForm);
    elements.userOverlay.addEventListener("click", closeUserForm);
    var pageCloseButtons = document.querySelectorAll(".page-close");
    for (var i = 0; i < pageCloseButtons.length; i++) {
      pageCloseButtons[i].addEventListener("click", function () { showSection("pos"); });
    }
    elements.settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      saveSettingsForm();
    });
    elements.sfLogoChoose.addEventListener("click", function () { elements.sfLogoFile.click(); });
    elements.sfLogoRemove.addEventListener("click", function () { setSettingsLogo(""); });
    elements.sfShortName.addEventListener("input", function () {
      if (!settingsLogo) { setSettingsLogo(""); }
    });
    elements.sfLogoFile.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      handleSettingsLogo(file);
    });
    elements.backupExport.addEventListener("click", exportPosBackup);
    elements.backupChoose.addEventListener("click", function () {
      if (!isAdmin()) { showToast("Admin access is required."); return; }
      elements.backupFile.click();
    });
    elements.backupFile.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      selectBackupFile(file);
    });
    elements.backupRestore.addEventListener("click", restoreSelectedBackup);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.userModal.hidden) { closeUserForm(); }
    });
  }

  function renderUsers() {
    if (!isAdmin()) {
      showSection("pos");
      return;
    }
    var users = storage.getCashiers();
    elements.userList.innerHTML = "";
    for (var i = 0; i < users.length; i++) {
      elements.userList.appendChild(buildUserRow(users[i]));
    }
  }

  function buildUserRow(user) {
    var row = document.createElement("div");
    row.className = "manage-row";
    var info = document.createElement("div");
    info.className = "manage-row__info";
    var name = document.createElement("div");
    name.className = "manage-row__name";
    name.textContent = user.name;
    var meta = document.createElement("div");
    meta.className = "manage-row__meta";
    meta.textContent = titleCase(user.role) + " · PIN •••• · " + (user.active ? "Active" : "Inactive");
    info.appendChild(name);
    info.appendChild(meta);
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn--secondary";
    edit.textContent = "Edit";
    edit.addEventListener("click", function () { openUserForm(user); });
    row.appendChild(info);
    row.appendChild(edit);
    return row;
  }

  function titleCase(value) {
    value = String(value || "");
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function openUserForm(user) {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    editingUserId = user ? user.id : null;
    elements.userModalTitle.textContent = user ? "Edit user" : "Add user";
    elements.ufName.value = user ? user.name : "";
    elements.ufPin.value = "";
    elements.ufPinNote.textContent = user ? "Leave blank to keep the current PIN." : "Enter 4–6 digits.";
    elements.ufRole.value = user ? user.role : "cashier";
    elements.ufActive.checked = user ? user.active !== false : true;
    elements.userError.textContent = "";
    elements.userModal.hidden = false;
    elements.ufName.focus();
  }

  function closeUserForm() {
    elements.userModal.hidden = true;
    editingUserId = null;
  }

  function saveUserForm() {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    var users = storage.getCashiers();
    var existing = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === editingUserId) { existing = users[i]; break; }
    }
    var name = elements.ufName.value.trim();
    var pin = elements.ufPin.value.trim();
    if (!name) { elements.userError.textContent = "Enter a name."; return; }
    if ((!existing || pin) && !/^[0-9]{4,6}$/.test(pin)) {
      elements.userError.textContent = "PIN must contain 4–6 digits.";
      return;
    }
    var finalPin = pin || (existing && String(existing.pin));
    for (var j = 0; j < users.length; j++) {
      if (users[j].id !== editingUserId && String(users[j].pin) === finalPin) {
        elements.userError.textContent = "That PIN is already in use.";
        return;
      }
    }
    if (existing && existing.id === currentUser.id && currentUser.role === "admin" && !elements.ufActive.checked) {
      elements.userError.textContent = "The currently logged-in admin cannot be deactivated.";
      return;
    }
    if (existing && existing.id === currentUser.id && elements.ufRole.value !== "admin") {
      elements.userError.textContent = "The currently logged-in admin cannot change their own role.";
      return;
    }
    var user = {
      id: editingUserId || createId("user"),
      name: name,
      pin: finalPin,
      role: elements.ufRole.value,
      active: elements.ufActive.checked
    };
    if (!storage.saveCashier(user)) { elements.userError.textContent = "Could not save the user."; return; }
    closeUserForm();
    renderUsers();
    showToast("User saved.");
  }

  function renderSettings() {
    if (!isAdmin()) { showSection("pos"); return; }
    var settings = storage.getSettings() || {};
    elements.sfBusinessName.value = settings.businessName || "";
    elements.sfShortName.value = settings.shortName || "";
    elements.sfPhone.value = settings.phone || "";
    elements.sfAddress.value = settings.address || "";
    elements.sfCurrencyCode.value = settings.currencyCode || "";
    elements.sfCurrencySymbol.value = settings.currencySymbol || "";
    elements.sfReceiptPrefix.value = settings.receiptPrefix || "";
    elements.sfReceiptFooter.value = settings.receiptFooterNote || "Thank you!";
    elements.sfReceiptExtraInfo.value = settings.receiptExtraInfo || "";
    elements.sfReceiptPaper.value = settings.receiptPaperWidth === "58mm" ? "58mm" : "80mm";
    elements.settingsError.textContent = "";
    resetBackupSelection();
    setSettingsLogo(settings.logo || "");
  }

  function resetBackupSelection() {
    selectedBackup = null;
    elements.backupPreview.hidden = true;
    elements.backupRestore.disabled = true;
    elements.backupError.textContent = "";
  }

  function exportPosBackup() {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    var result = backupService.exportBackup(currentUser.role);
    if (!result.ok) { elements.backupError.textContent = result.message; return; }
    var blob = new Blob([result.json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    elements.backupError.textContent = "";
    showToast("Backup exported.");
  }

  function selectBackupFile(file) {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    resetBackupSelection();
    if (!file) { return; }
    if (!/\.json$/i.test(file.name)) {
      elements.backupError.textContent = "Choose a JSON backup file.";
      return;
    }
    file.text().then(function (text) {
      var result = backupService.parseBackup(currentUser && currentUser.role, text);
      if (!result.ok) { elements.backupError.textContent = result.message; return; }
      selectedBackup = result.backup;
      elements.backupBusiness.textContent = result.preview.businessName;
      elements.backupDate.textContent = result.preview.backupDate;
      elements.backupUsers.textContent = result.preview.usersCount;
      elements.backupProducts.textContent = result.preview.productsCount;
      elements.backupSales.textContent = result.preview.salesCount;
      elements.backupInventory.textContent = result.preview.inventoryProductsCount;
      elements.backupPreview.hidden = false;
      elements.backupRestore.disabled = false;
    }).catch(function () {
      elements.backupError.textContent = "The selected backup file could not be read.";
    });
  }

  function restoreSelectedBackup() {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    if (!selectedBackup) { elements.backupError.textContent = "Choose and validate a backup file first."; return; }
    var confirmed = global.confirm("Restore this backup? Current POS data will be replaced and you will be signed out.");
    if (!confirmed) { return; }
    elements.backupRestore.disabled = true;
    var result = backupService.restoreBackup(currentUser.role, selectedBackup, true);
    if (!result.ok) {
      elements.backupRestore.disabled = false;
      elements.backupError.textContent = result.message;
      return;
    }
    showToast("Backup restored. Reloading POS...");
    global.setTimeout(function () { global.location.reload(); }, 400);
  }

  function setSettingsLogo(value) {
    settingsLogo = value || "";
    elements.sfLogoPreview.innerHTML = "";
    if (settingsLogo) {
      var img = document.createElement("img");
      img.src = settingsLogo;
      img.alt = "Business logo preview";
      elements.sfLogoPreview.appendChild(img);
      elements.sfLogoChoose.textContent = "Replace logo";
      elements.sfLogoRemove.hidden = false;
    } else {
      var fallback = document.createElement("span");
      fallback.className = "brand-logo brand-logo--lg";
      fallback.textContent = elements.sfShortName.value.trim() || "Logo";
      elements.sfLogoPreview.appendChild(fallback);
      elements.sfLogoChoose.textContent = "Choose logo";
      elements.sfLogoRemove.hidden = true;
    }
  }

  function handleSettingsLogo(file) {
    if (!file) { return; }
    if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1 || file.size > MAX_IMAGE_BYTES) {
      elements.settingsError.textContent = "Choose a JPG, PNG, WebP or GIF up to 5 MB.";
      return;
    }
    compressImage(file, function (error, dataUrl) {
      if (error) { elements.settingsError.textContent = "Could not read that image."; return; }
      elements.settingsError.textContent = "";
      setSettingsLogo(dataUrl);
    });
  }

  function saveSettingsForm() {
    if (!isAdmin()) { showToast("Admin access is required."); return; }
    var businessName = elements.sfBusinessName.value.trim();
    var shortName = elements.sfShortName.value.trim();
    var currencyCode = elements.sfCurrencyCode.value.trim().toUpperCase();
    var currencySymbol = elements.sfCurrencySymbol.value.trim();
    var receiptPrefix = elements.sfReceiptPrefix.value.trim().toUpperCase();
    if (!businessName || !shortName || !currencyCode || !currencySymbol || !receiptPrefix) {
      elements.settingsError.textContent = "Complete all required business and currency fields.";
      return;
    }
    if (!/^[A-Z0-9]+$/.test(receiptPrefix)) {
      elements.settingsError.textContent = "Receipt prefix may use uppercase letters and numbers only.";
      return;
    }
    var oldSettings = storage.getSettings() || {};
    var settings = {
      businessName: businessName,
      shortName: shortName,
      logo: settingsLogo,
      phone: elements.sfPhone.value.trim(),
      address: elements.sfAddress.value.trim(),
      currencyCode: currencyCode,
      currencySymbol: currencySymbol,
      receiptPrefix: receiptPrefix,
      receiptFooterNote: elements.sfReceiptFooter.value.trim(),
      receiptExtraInfo: elements.sfReceiptExtraInfo.value.trim(),
      receiptPaperWidth: elements.sfReceiptPaper.value === "58mm" ? "58mm" : "80mm",
      dataVersion: oldSettings.dataVersion || 2
    };
    if (!storage.saveSettings(settings)) { elements.settingsError.textContent = "Could not save settings."; return; }
    state.settings = settings;
    money.setCurrencySymbol(settings.currencySymbol);
    applyBranding();
    renderProducts();
    renderCart();
    renderSettings();
    showToast("Settings saved.");
  }

  // --- Sales history ------------------------------------------------------

  var SALES_HISTORY_PAGE_SIZE = 12;
  var salesHistoryPage = 1;

  function bindSalesHistoryEvents() {
    setDefaultSalesHistoryDates();
    var rerender = function () { salesHistoryPage = 1; renderSalesHistory(); };
    elements.salesHistorySearch.addEventListener("input", rerender);
    elements.salesHistoryFrom.addEventListener("change", rerender);
    elements.salesHistoryTo.addEventListener("change", rerender);
    elements.salesHistoryPayment.addEventListener("change", rerender);
    elements.salesHistoryCashier.addEventListener("change", rerender);
    elements.salesHistoryFrom.addEventListener("keydown", function (event) { if (event.key === "Enter") { rerender(); } });
    elements.salesHistoryTo.addEventListener("keydown", function (event) { if (event.key === "Enter") { rerender(); } });
    bindSalesHistoryCalendar(elements.salesHistoryFromCalendar, elements.salesHistoryFromNative, elements.salesHistoryFrom, rerender);
    bindSalesHistoryCalendar(elements.salesHistoryToCalendar, elements.salesHistoryToNative, elements.salesHistoryTo, rerender);
    elements.salesHistoryReset.addEventListener("click", function () {
      elements.salesHistorySearch.value = "";
      elements.salesHistoryFrom.value = "";
      elements.salesHistoryTo.value = "";
      elements.salesHistoryFromNative.value = "";
      elements.salesHistoryToNative.value = "";
      elements.salesHistoryPayment.value = "all";
      elements.salesHistoryCashier.value = "all";
      rerender();
    });
    elements.salesHistoryPrevious.addEventListener("click", function () {
      if (salesHistoryPage > 1) { salesHistoryPage--; renderSalesHistory(); }
    });
    elements.salesHistoryNext.addEventListener("click", function () {
      salesHistoryPage++;
      renderSalesHistory();
    });
  }

  function setDefaultSalesHistoryDates() {
    var today = new Date();
    var from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    var fromKey = localDateKey(from);
    var toKey = localDateKey(today);
    elements.salesHistoryFrom.value = reports.formatDateKey(fromKey);
    elements.salesHistoryTo.value = reports.formatDateKey(toKey);
    elements.salesHistoryFromNative.value = fromKey;
    elements.salesHistoryToNative.value = toKey;
  }

  function bindSalesHistoryCalendar(button, nativeInput, displayInput, onChange) {
    button.addEventListener("click", function () {
      var currentKey = reports.displayDateToKey(displayInput.value);
      if (currentKey) { nativeInput.value = currentKey; }
      if (typeof nativeInput.showPicker === "function") { nativeInput.showPicker(); }
      else { nativeInput.click(); }
    });
    nativeInput.addEventListener("change", function () {
      if (nativeInput.value) {
        displayInput.value = reports.formatDateKey(nativeInput.value);
        onChange();
      }
    });
  }

  function localDateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function renderSalesHistoryCashiers(sales) {
    var selected = elements.salesHistoryCashier.value || "all";
    var names = [];
    for (var i = 0; i < sales.length; i++) {
      var name = sales[i].cashier && sales[i].cashier.name;
      if (name && names.indexOf(name) === -1) { names.push(name); }
    }
    names.sort();
    elements.salesHistoryCashier.innerHTML = "";
    var all = document.createElement("option");
    all.value = "all";
    all.textContent = "All cashiers";
    elements.salesHistoryCashier.appendChild(all);
    for (var j = 0; j < names.length; j++) {
      var option = document.createElement("option");
      option.value = names[j];
      option.textContent = names[j];
      elements.salesHistoryCashier.appendChild(option);
    }
    elements.salesHistoryCashier.value = names.indexOf(selected) !== -1 ? selected : "all";
  }

  function renderSalesHistory() {
    if (!currentUser || !auth.canAccess(currentUser.role, "sales-history")) {
      showToast("You do not have access to Sales History.");
      showSection("pos");
      return;
    }
    var fromText = elements.salesHistoryFrom.value.trim();
    var toText = elements.salesHistoryTo.value.trim();
    var fromDate = fromText ? reports.displayDateToKey(fromText) : "";
    var toDate = toText ? reports.displayDateToKey(toText) : "";
    if ((fromText && !fromDate) || (toText && !toDate)) {
      elements.salesHistoryError.textContent = "Enter dates as DD-MM-YYYY.";
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      elements.salesHistoryError.textContent = "From date cannot be later than To date.";
      return;
    }
    elements.salesHistoryError.textContent = "";
    elements.salesHistoryFrom.value = fromDate ? reports.formatDateKey(fromDate) : "";
    elements.salesHistoryTo.value = toDate ? reports.formatDateKey(toDate) : "";
    elements.salesHistoryFromNative.value = fromDate;
    elements.salesHistoryToNative.value = toDate;
    var storedSales = storage.getSales();
    if (!Array.isArray(storedSales)) { storedSales = []; }
    renderSalesHistoryCashiers(storedSales.filter(function (sale) { return sale && sale.status === "completed"; }));
    var history = salesHistory.getHistory({
      query: elements.salesHistorySearch.value,
      fromDate: fromDate,
      toDate: toDate,
      cashier: elements.salesHistoryCashier.value,
      paymentMethod: elements.salesHistoryPayment.value
    });
    var pageCount = Math.max(1, Math.ceil(history.sales.length / SALES_HISTORY_PAGE_SIZE));
    if (salesHistoryPage > pageCount) { salesHistoryPage = pageCount; }
    var start = (salesHistoryPage - 1) * SALES_HISTORY_PAGE_SIZE;
    var pageSales = history.sales.slice(start, start + SALES_HISTORY_PAGE_SIZE);

    elements.salesHistoryCount.textContent = String(history.transactionCount);
    elements.salesHistoryTotal.textContent = money.formatMoney(history.totalRevenue);
    elements.salesHistoryBody.innerHTML = "";
    for (var i = 0; i < pageSales.length; i++) {
      elements.salesHistoryBody.appendChild(buildSalesHistoryRow(pageSales[i]));
    }
    elements.salesHistoryEmpty.hidden = history.sales.length !== 0;
    elements.salesHistoryPage.textContent = "Page " + salesHistoryPage + " of " + pageCount;
    elements.salesHistoryPrevious.disabled = salesHistoryPage <= 1;
    elements.salesHistoryNext.disabled = salesHistoryPage >= pageCount;
    elements.salesHistoryPrevious.parentElement.hidden = history.sales.length <= SALES_HISTORY_PAGE_SIZE;
  }

  function buildSalesHistoryRow(sale) {
    var row = document.createElement("tr");
    var items = Array.isArray(sale.items) ? sale.items : [];
    var unitCount = items.reduce(function (sum, item) { return sum + Number(item.quantity || 0); }, 0);
    appendHistoryCell(row, "Receipt", sale.receiptNumber || "—", "sales-history__receipt");
    appendHistoryCell(row, "Date & time", formatSalesHistoryDateTime(sale.createdAt));
    appendHistoryCell(row, "Cashier", (sale.cashier && sale.cashier.name) || "—");
    appendHistoryCell(row, "Payment", sale.payment && sale.payment.method === "momo" ? "MoMo" : "Cash");
    appendHistoryCell(row, "Items", unitCount + (unitCount === 1 ? " item" : " items"));
    appendHistoryCell(row, "Total", money.formatMoney(sale.total), "sales-history__total");
    var actionCell = document.createElement("td");
    actionCell.setAttribute("data-label", "Action");
    var view = document.createElement("button");
    view.type = "button";
    view.className = "btn btn--secondary";
    view.textContent = "View receipt";
    view.setAttribute("aria-label", "View receipt " + (sale.receiptNumber || ""));
    view.addEventListener("click", function () { showReceipt(sale, true); });
    actionCell.appendChild(view);
    row.appendChild(actionCell);
    return row;
  }

  function appendHistoryCell(row, label, value, className) {
    var cell = document.createElement("td");
    cell.setAttribute("data-label", label);
    cell.className = className || "";
    cell.textContent = value;
    row.appendChild(cell);
  }

  function formatSalesHistoryDateTime(iso) {
    try {
      var date = new Date(iso);
      if (isNaN(date.getTime())) { return "—"; }
      var day = String(date.getDate()).padStart(2, "0");
      var month = String(date.getMonth() + 1).padStart(2, "0");
      var hours = String(date.getHours()).padStart(2, "0");
      var minutes = String(date.getMinutes()).padStart(2, "0");
      return day + "-" + month + "-" + date.getFullYear() + " " + hours + ":" + minutes;
    } catch (error) {
      return "—";
    }
  }

  // --- Checkout (Cash / MoMo) ---------------------------------------------

  var checkoutMethod = "cash"; // "cash" | "momo"
  var isCompleting = false;    // guards against duplicate submission

  function bindCheckoutEvents() {
    elements.checkoutButton.addEventListener("click", openCheckout);
    elements.payCash.addEventListener("click", function () { selectMethod("cash"); });
    elements.payMomo.addEventListener("click", function () { selectMethod("momo"); });
    elements.checkoutAmount.addEventListener("input", updateChange);
    elements.checkoutComplete.addEventListener("click", completeCheckout);
    elements.checkoutCancel.addEventListener("click", closeCheckout);
    elements.checkoutClose.addEventListener("click", closeCheckout);
    elements.checkoutOverlay.addEventListener("click", closeCheckout);
    elements.receiptDone.addEventListener("click", closeReceipt);
    elements.receiptPrint.addEventListener("click", printReceipt);
    elements.receiptClose.addEventListener("click", closeReceipt);
    elements.receiptOverlay.addEventListener("click", closeReceipt);
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") { return; }
      if (!elements.checkoutModal.hidden) { closeCheckout(); }
      else if (!elements.receiptModal.hidden) { closeReceipt(); }
    });
  }

  function currentSaleTotal() {
    var subtotal = pricing.calculateCartSubtotal(state.cart);
    return pricing.calculateSaleTotal(subtotal, 0);
  }

  function openCheckout() {
    if (validation.isCartEmpty(state.cart)) {
      showToast("The cart is empty. Add an item before checkout.");
      return;
    }
    isCompleting = false;
    elements.checkoutComplete.disabled = false;
    elements.checkoutAmount.value = "";
    elements.checkoutMomoRef.value = "";
    setCheckoutError("");
    elements.checkoutTotal.textContent = money.formatMoney(currentSaleTotal());
    selectMethod("cash");
    elements.checkoutModal.hidden = false;
    elements.checkoutAmount.focus();
  }

  function closeCheckout() {
    elements.checkoutModal.hidden = true;
  }

  function selectMethod(method) {
    checkoutMethod = method;
    var isCash = (method === "cash");
    elements.payCash.classList.toggle("pay-method--active", isCash);
    elements.payMomo.classList.toggle("pay-method--active", !isCash);
    elements.payCash.setAttribute("aria-checked", isCash ? "true" : "false");
    elements.payMomo.setAttribute("aria-checked", !isCash ? "true" : "false");
    elements.cashFields.hidden = !isCash;
    elements.momoFields.hidden = isCash;
    setCheckoutError("");
    if (isCash) { updateChange(); }
  }

  /** Live change display (cash only). Never shows a negative change. */
  function updateChange() {
    var change = pricing.calculateChange(Number(elements.checkoutAmount.value), currentSaleTotal());
    elements.checkoutChange.textContent = money.formatMoney(change < 0 ? 0 : change);
  }

  function setCheckoutError(message) {
    elements.checkoutError.textContent = message;
  }

  function completeCheckout() {
    if (isCompleting) {
      return; // duplicate-submission guard
    }
    if (validation.isCartEmpty(state.cart)) {
      setCheckoutError("The cart is empty.");
      return;
    }

    var total = currentSaleTotal();
    var payment;

    if (checkoutMethod === "cash") {
      // Requires amount received, rejects below total (shared validator).
      var check = validation.validateCheckout(state.cart, elements.checkoutAmount.value);
      if (!check.valid) {
        setCheckoutError(check.message);
        return;
      }
      var amountPaid = money.roundMoney(Number(elements.checkoutAmount.value));
      payment = {
        method: "cash",
        amountPaid: amountPaid,
        change: pricing.calculateChange(amountPaid, total) // shared pricing
      };
    } else {
      // MoMo: amount paid equals the total, no change, optional reference.
      payment = {
        method: "momo",
        amountPaid: total,
        change: 0,
        reference: elements.checkoutMomoRef.value.trim()
      };
    }

    // The sale is going through: lock out further clicks before any writes.
    isCompleting = true;
    elements.checkoutComplete.disabled = true;

    var sale = {
      id: createId("sale"),
      receiptNumber: storage.generateReceiptNumber(),
      createdAt: new Date().toISOString(),
      cashier: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
      items: JSON.parse(JSON.stringify(state.cart)), // snapshot of names/prices
      subtotal: pricing.calculateCartSubtotal(state.cart),
      discount: 0,
      total: total,
      payment: payment,
      receiptSettings: storage.createReceiptSettingsSnapshot(state.settings),
      status: "completed"
    };

    // Stock is only reduced here, inside a completed sale.
    var completion = storage.completeSale(sale);
    if (!completion.success) {
      isCompleting = false;
      elements.checkoutComplete.disabled = false;
      setCheckoutError(completion.message || "Could not save the sale safely. Please try again.");
      return;
    }

    // Refresh from storage: cart cleared, inventory stock reduced.
    state.cart = storage.getCurrentCart();
    state.inventoryProducts = storage.getInventoryProducts();
    renderProducts();
    renderCart();

    closeCheckout();
    showReceipt(sale);
    showToast("Sale completed. Receipt " + sale.receiptNumber + ".");
  }

  // --- Receipt -------------------------------------------------------------

  function showReceipt(sale, isHistorical) {
    renderReceipt(sale, isHistorical);
    elements.receiptModal.hidden = false;
    elements.receiptDone.focus();
  }

  function closeReceipt() {
    elements.receiptModal.hidden = true;
  }

  function printReceipt() {
    if (elements.receiptModal.hidden) { return; }
    window.print();
  }

  // --- Reprint receipt (cashier-safe) -------------------------------------
  // Looks up one past sale by receipt number or reference and reuses the
  // receipt renderer. Cashiers only reach their own sales (see the service);
  // this does not open Sales History or expose totals/reports.

  function bindReprintEvents() {
    elements.reprintButton.addEventListener("click", openReprint);
    elements.reprintFind.addEventListener("click", doReprintSearch);
    elements.reprintCancel.addEventListener("click", closeReprint);
    elements.reprintClose.addEventListener("click", closeReprint);
    elements.reprintOverlay.addEventListener("click", closeReprint);
    elements.reprintSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        doReprintSearch();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.reprintModal.hidden) {
        closeReprint();
      }
    });
  }

  function openReprint() {
    elements.reprintSearch.value = "";
    setReprintError("");
    renderReprintRecent();
    elements.reprintModal.hidden = false;
    elements.reprintSearch.focus();
  }

  function closeReprint() {
    elements.reprintModal.hidden = true;
  }

  function setReprintError(message) {
    elements.reprintError.textContent = message;
  }

  function doReprintSearch() {
    var result = reprint.findSale(elements.reprintSearch.value, currentUser);
    if (result.status === "empty") {
      setReprintError("Enter a receipt number or reference.");
      return;
    }
    if (result.status === "not-found") {
      setReprintError("No receipt found for that number or reference.");
      return;
    }
    setReprintError("");
    closeReprint();
    showReceipt(result.sale, true); // reuse the existing receipt renderer
  }

  /**
   * Today's sales the current user may reprint (their own, for cashiers). This
   * is how a cashier finds a receipt when the customer did not keep the number:
   * pick it from today's list instead of typing.
   */
  function renderReprintRecent() {
    var recent = reprint.getRecentSales(currentUser, true, 8);
    elements.reprintRecent.hidden = false;
    elements.reprintRecentList.innerHTML = "";
    if (recent.length === 0) {
      var empty = document.createElement("p");
      empty.className = "reprint-recent__empty";
      empty.textContent = "No sales yet today.";
      elements.reprintRecentList.appendChild(empty);
      return;
    }
    for (var i = 0; i < recent.length; i++) {
      elements.reprintRecentList.appendChild(buildReprintRecentItem(recent[i]));
    }
  }

  function buildReprintRecentItem(sale) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "reprint-recent__item";

    var receipt = document.createElement("span");
    receipt.className = "reprint-recent__receipt";
    receipt.textContent = sale.receiptNumber || "(no number)";

    var time = document.createElement("span");
    time.className = "reprint-recent__time";
    time.textContent = formatSalesHistoryDateTime(sale.createdAt);

    button.appendChild(receipt);
    button.appendChild(time);
    button.addEventListener("click", function () {
      closeReprint();
      showReceipt(sale, true);
    });
    return button;
  }

  function renderReceipt(sale, isHistorical) {
    var settings = storage.getReceiptSettings(sale, state.settings);
    var container = elements.receiptContent;
    container.innerHTML = "";
    container.className = "receipt " + (settings.receiptPaperWidth === "58mm" ? "receipt--58mm" : "receipt--80mm");

    var brand = document.createElement("div");
    brand.className = "receipt__brand";
    var logo = document.createElement("span");
    logo.className = "brand-logo brand-logo--lg receipt__logo";
    renderLogo(logo, settings);
    brand.appendChild(logo);

    var business = document.createElement("h3");
    business.className = "receipt__business";
    business.textContent = settings.businessName || "Receipt";
    brand.appendChild(business);

    if (settings.phone) { brand.appendChild(receiptBusinessDetail("Telephone", settings.phone)); }
    if (settings.address) { brand.appendChild(receiptBusinessDetail("Address", settings.address)); }
    if (settings.receiptExtraInfo) {
      var extraInfo = document.createElement("p");
      extraInfo.className = "receipt__extra-info";
      extraInfo.textContent = settings.receiptExtraInfo;
      brand.appendChild(extraInfo);
    }
    container.appendChild(brand);

    var meta = document.createElement("div");
    meta.className = "receipt__meta";
    meta.appendChild(receiptMetaLine("Receipt", sale.receiptNumber));
    meta.appendChild(receiptMetaLine("Date", isHistorical ? formatSalesHistoryDateTime(sale.createdAt) : formatDateTime(sale.createdAt)));
    if (sale.cashier && sale.cashier.name) {
      meta.appendChild(receiptMetaLine("Cashier", sale.cashier.name));
    }
    container.appendChild(meta);

    var list = document.createElement("ul");
    list.className = "receipt__items";
    for (var i = 0; i < sale.items.length; i++) {
      list.appendChild(buildReceiptItem(sale.items[i]));
    }
    container.appendChild(list);

    var summary = document.createElement("section");
    summary.className = "receipt__summary";
    summary.appendChild(receiptLine("Total", money.formatMoney(sale.total), "receipt__line--total"));
    summary.appendChild(receiptLine("Payment method", sale.payment.method === "momo" ? "MoMo" : "Cash"));

    if (sale.payment.method === "cash") {
      summary.appendChild(receiptLine("Amount paid", money.formatMoney(sale.payment.amountPaid)));
      summary.appendChild(receiptLine("Change", money.formatMoney(sale.payment.change), "receipt__line--change"));
    } else if (sale.payment.reference) {
      summary.appendChild(receiptLine("MoMo reference", sale.payment.reference));
    }
    container.appendChild(summary);

    var thanks = document.createElement("p");
    thanks.className = "receipt__thanks";
    thanks.textContent = settings.receiptFooterNote || "Thank you!";
    container.appendChild(thanks);
  }

  function receiptBusinessDetail(label, value) {
    var detail = document.createElement("p");
    detail.className = "receipt__contact";
    var labelElement = document.createElement("strong");
    labelElement.textContent = label + ": ";
    detail.appendChild(labelElement);
    detail.appendChild(document.createTextNode(value));
    return detail;
  }

  function receiptMetaLine(label, value) {
    var row = document.createElement("div");
    row.className = "receipt__meta-line";
    var labelElement = document.createElement("span");
    labelElement.textContent = label;
    var valueElement = document.createElement("strong");
    valueElement.textContent = value;
    row.appendChild(labelElement);
    row.appendChild(valueElement);
    return row;
  }

  function buildReceiptItem(item) {
    var li = document.createElement("li");
    li.className = "receipt__item";

    var row = document.createElement("div");
    row.className = "receipt__item-row";
    var name = document.createElement("span");
    name.textContent = (isConfiguredMeal(item) && item.portion)
      ? item.productName + " — " + item.portion.name
      : item.productName;
    var lineTotal = document.createElement("span");
    lineTotal.textContent = money.formatMoney(item.lineTotal);
    row.appendChild(name);
    row.appendChild(lineTotal);
    li.appendChild(row);

    var details = [];
    var unit = (item.unitTotal != null) ? item.unitTotal : item.unitPrice;
    details.push("Qty " + item.quantity + " × " + money.formatMoney(unit));
    if (isConfiguredMeal(item)) {
      if (item.protein) { details.push("Protein: " + item.protein.name); }
      if (item.extras && item.extras.length) {
        details.push("Extras: " + item.extras.map(function (e) {
          return e.name + " × " + e.quantity;
        }).join(", "));
      }
    }
    var detail = document.createElement("div");
    detail.className = "receipt__item-detail";
    detail.textContent = details.join(" · ");
    li.appendChild(detail);
    return li;
  }

  function receiptLine(label, value, extraClass) {
    var row = document.createElement("div");
    row.className = "receipt__line" + (extraClass ? " " + extraClass : "");
    var labelEl = document.createElement("span");
    labelEl.textContent = label;
    var valueEl = document.createElement("span");
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  function formatDateTime(iso) {
    try {
      var date = new Date(iso);
      if (isNaN(date.getTime())) { return iso; }
      var day = String(date.getDate()).padStart(2, "0");
      var month = String(date.getMonth() + 1).padStart(2, "0");
      var year = date.getFullYear();
      var time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return day + "-" + month + "-" + year + " · " + time;
    } catch (error) {
      return iso;
    }
  }

  // --- Startup -------------------------------------------------------------

  function init() {
    getElements();
    storage.seedInitialData(); // writes seed data only on first launch
    loadState();
    applyBranding();
    bindAuthEvents();
    bindPosEvents();
    bindModalEvents();
    bindManageEvents();
    bindAdminEvents();
    bindReportEvents();
    bindSalesHistoryEvents();
    bindCheckoutEvents();
    bindReprintEvents();

    // POS content can be rendered while hidden; it is revealed after login.
    renderCategories();
    renderProducts();
    renderCart();

    // Restore a previous session if one exists, otherwise show the login pad.
    currentUser = auth.getCurrentUser();
    if (currentUser) {
      showPos();
    } else {
      showLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  // Exposed for manual testing in the browser console.
  global.GCK.app = { state: state };
})(window);
