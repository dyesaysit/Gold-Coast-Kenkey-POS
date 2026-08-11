/*
 * app.js
 * The user-interface layer for the foundation build. It renders the header,
 * category bar, product tiles, and cart, and wires up clicks.
 *
 * This file must stay free of business logic: all money math, validation, and
 * storage go through the shared modules (AGENTS.md architecture rules 4.1-4.5).
 *   GCK.money       -> formatting and rounding
 *   GCK.pricing     -> totals
 *   GCK.validation  -> input and stock checks
 *   GCK.storage     -> the single storage service
 *
 * Scope note: full meal configuration, checkout, and reports are later features
 * and are intentionally not implemented here.
 */
(function (global) {
  "use strict";

  var money = global.GCK.money;
  var pricing = global.GCK.pricing;
  var validation = global.GCK.validation;
  var storage = global.GCK.storage;

  // In-memory view of catalogue data, loaded once from storage.
  var state = {
    settings: null,
    categories: [],
    menuItems: [],
    portions: [],
    inventoryProducts: [],
    cart: [],
    activeCategoryId: "all"
  };

  var elements = {};
  var toastTimer = null;

  // --- Small UI helpers ----------------------------------------------------

  function getElements() {
    elements.businessName = document.getElementById("business-name");
    elements.categoryBar = document.getElementById("category-bar");
    elements.productGrid = document.getElementById("product-grid");
    elements.cartItems = document.getElementById("cart-items");
    elements.cartEmpty = document.getElementById("cart-empty");
    elements.cartSubtotal = document.getElementById("cart-subtotal");
    elements.cartTotal = document.getElementById("cart-total");
    elements.checkoutButton = document.getElementById("checkout-button");
    elements.toast = document.getElementById("toast");
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
    state.cart = storage.getCurrentCart();

    if (state.settings && state.settings.currencySymbol) {
      money.setCurrencySymbol(state.settings.currencySymbol);
    }
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
      // Full meal configuration is a later feature.
      showToast("Meal configuration is coming in the next feature.");
      return;
    }
    addInventoryProductToCart(product);
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
    name.textContent = item.productName;

    var lineTotal = document.createElement("span");
    lineTotal.className = "cart-item__line-total";
    lineTotal.textContent = money.formatMoney(item.lineTotal);

    topRow.appendChild(name);
    topRow.appendChild(lineTotal);

    var meta = document.createElement("div");
    meta.className = "cart-item__meta";
    meta.textContent = "Qty " + item.quantity + " x " + money.formatMoney(item.unitPrice);

    var actionRow = document.createElement("div");
    actionRow.className = "cart-item__row";

    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn--danger";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", function () {
      removeCartItem(item.id);
    });
    actionRow.appendChild(removeButton);

    li.appendChild(topRow);
    li.appendChild(meta);
    li.appendChild(actionRow);
    return li;
  }

  // --- Startup -------------------------------------------------------------

  function init() {
    getElements();
    storage.seedInitialData(); // writes seed data only on first launch
    loadState();

    if (state.settings && state.settings.businessName) {
      elements.businessName.textContent = state.settings.businessName;
    }

    renderCategories();
    renderProducts();
    renderCart();
  }

  document.addEventListener("DOMContentLoaded", init);

  // Exposed for manual testing in the browser console.
  global.GCK.app = { state: state };
})(window);
