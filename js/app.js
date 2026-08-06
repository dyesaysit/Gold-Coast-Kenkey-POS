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
 * Scope note: full meal configuration, checkout, reports, and inventory/user
 * management screens are later features and are intentionally not built here.
 */
(function (global) {
  "use strict";

  var money = global.GCK.money;
  var pricing = global.GCK.pricing;
  var validation = global.GCK.validation;
  var storage = global.GCK.storage;
  var auth = global.GCK.auth;

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
    elements.loginBusiness = document.getElementById("login-business");
    elements.pinDots = document.getElementById("pin-dots");
    elements.pinPad = document.getElementById("pin-pad");
    elements.loginError = document.getElementById("login-error");

    // POS view
    elements.posView = document.getElementById("pos-view");
    elements.businessName = document.getElementById("business-name");
    elements.userName = document.getElementById("user-name");
    elements.userRole = document.getElementById("user-role");
    elements.appNav = document.getElementById("app-nav");
    elements.logoutButton = document.getElementById("logout-button");
    elements.categoryBar = document.getElementById("category-bar");
    elements.productGrid = document.getElementById("product-grid");
    elements.cartItems = document.getElementById("cart-items");
    elements.cartEmpty = document.getElementById("cart-empty");
    elements.cartSubtotal = document.getElementById("cart-subtotal");
    elements.cartTotal = document.getElementById("cart-total");
    elements.checkoutButton = document.getElementById("checkout-button");
    elements.toast = document.getElementById("toast");

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

  function applyBusinessName() {
    if (state.settings && state.settings.businessName) {
      elements.businessName.textContent = state.settings.businessName;
      elements.loginBusiness.textContent = state.settings.businessName;
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
   * (cashier: POS; supervisor: POS + history + reports; admin: all).
   * This is the visible half of access control; the allowed list itself lives
   * in the auth service.
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
      return; // the POS screen is already visible
    }
    // These screens are accessible to the role but not built yet.
    showToast(item.label + " is coming in a later feature.");
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
    var products = [];
    var i;

    for (i = 0; i < state.menuItems.length; i++) {
      if (state.menuItems[i].active) {
        products.push(state.menuItems[i]);
      }
    }
    for (i = 0; i < state.inventoryProducts.length; i++) {
      if (state.inventoryProducts[i].active) {
        products.push(state.inventoryProducts[i]);
      }
    }

    if (state.activeCategoryId === "all") {
      return products;
    }
    return products.filter(function (product) {
      return product.categoryId === state.activeCategoryId;
    });
  }

  // --- Rendering: categories ----------------------------------------------

  function renderCategories() {
    elements.categoryBar.innerHTML = "";

    var chips = [{ id: "all", name: "All" }];
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
      empty.textContent = "No products in this category.";
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

    if (product.itemType === "configured-meal") {
      var startingPrice = getStartingPrice(product.id);
      price.textContent = startingPrice === null
        ? "—"
        : "From " + money.formatMoney(startingPrice);
    } else {
      // Inventory product: fixed price plus a stock line.
      price.textContent = money.formatMoney(product.sellingPrice);

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

    tile.appendChild(imageWrap);
    tile.appendChild(body);
    tile.addEventListener("click", function () {
      handleProductClick(product);
    });
    return tile;
  }

  // --- Product interaction -------------------------------------------------

  function handleProductClick(product) {
    if (product.itemType === "configured-meal") {
      openMealModal(product);
      return;
    }
    addInventoryProductToCart(product);
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
    state.cart.push({
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
    });

    // Each configuration is its own cart line (never merged with another).
    persistAndRenderCart();
    var name = mealConfig.menuItem.name;
    closeMealModal();
    showToast(name + " added to cart.");
  }

  /**
   * Add an inventory product to the cart. Identical products combine into one
   * line. Quantity can never exceed available stock (validation layer).
   */
  function addInventoryProductToCart(product) {
    var existing = null;
    for (var i = 0; i < state.cart.length; i++) {
      if (state.cart[i].productId === product.id) {
        existing = state.cart[i];
        break;
      }
    }

    var requested = existing ? existing.quantity + 1 : 1;
    var stockCheck = validation.validateStockAvailable(product.stockQuantity, requested);
    if (!stockCheck.valid) {
      showToast(stockCheck.message);
      return;
    }

    if (existing) {
      existing.quantity = requested;
      existing.lineTotal = pricing.calculateLineTotal(existing.unitPrice, existing.quantity);
    } else {
      state.cart.push({
        id: createId("cart"),
        itemType: "inventory-product",
        productId: product.id,
        productName: product.name,
        image: product.image,
        unitPrice: product.sellingPrice,
        quantity: 1,
        lineTotal: pricing.calculateLineTotal(product.sellingPrice, 1)
      });
    }

    persistAndRenderCart();
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
    if (item.itemType === "inventory-product") {
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
    persistAndRenderCart();
  }

  function persistAndRenderCart() {
    storage.saveCurrentCart(state.cart);
    renderCart();
  }

  // --- Rendering: cart -----------------------------------------------------

  function renderCart() {
    elements.cartItems.innerHTML = "";

    var empty = validation.isCartEmpty(state.cart);
    elements.cartEmpty.hidden = !empty;

    for (var i = 0; i < state.cart.length; i++) {
      elements.cartItems.appendChild(buildCartLine(state.cart[i]));
    }

    var subtotal = pricing.calculateCartSubtotal(state.cart);
    var total = pricing.calculateSaleTotal(subtotal, 0);
    elements.cartSubtotal.textContent = money.formatMoney(subtotal);
    elements.cartTotal.textContent = money.formatMoney(total);
  }

  function buildCartLine(item) {
    var li = document.createElement("li");
    li.className = "cart-item";

    var topRow = document.createElement("div");
    topRow.className = "cart-item__row";

    var name = document.createElement("span");
    name.className = "cart-item__name";
    // Configured meals show the meal name plus the chosen portion/package.
    name.textContent = (item.itemType === "configured-meal" && item.portion)
      ? item.productName + " — " + item.portion.name
      : item.productName;

    var lineTotal = document.createElement("span");
    lineTotal.className = "cart-item__line-total";
    lineTotal.textContent = money.formatMoney(item.lineTotal);

    topRow.appendChild(name);
    topRow.appendChild(lineTotal);
    li.appendChild(topRow);

    // Configuration details (protein, extras) for configured meals.
    if (item.itemType === "configured-meal") {
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

  // --- Startup -------------------------------------------------------------

  function init() {
    getElements();
    storage.seedInitialData(); // writes seed data only on first launch
    loadState();
    applyBusinessName();
    bindAuthEvents();
    bindModalEvents();

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
