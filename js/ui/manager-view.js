/*
 * manager-view.js
 * Member 3 (feature/inventory-reports): the Manager overlay UI.
 *
 * This is UI only. It reads data through the shared services and never does its
 * own money math, storage, or stock logic (AGENTS.md architecture rules):
 *   GCK.storage    -> read inventory products
 *   GCK.money      -> format prices
 *   GCK.inventory  -> low-stock list
 *   GCK.reports    -> daily sales summary
 *
 * The overlay holds two tabs, Inventory and Today's report. It is opened from a
 * header button and does not touch the cashier's sales screen or cart.
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;
  var money = global.GCK.money;
  var inventory = global.GCK.inventory;
  var reports = global.GCK.reports;

  var el = {};
  var lastFocused = null; // so focus can return to the button after closing

  // --- Tiny DOM helper -----------------------------------------------------

  /** Create an element with an optional class and text, to keep builders short. */
  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  function getElements() {
    el.openButton = document.getElementById("manager-button");
    el.overlay = document.getElementById("manager-overlay");
    el.close = document.getElementById("manager-close");
    el.tabInventory = document.getElementById("tab-inventory");
    el.tabReport = document.getElementById("tab-report");
    el.sectionInventory = document.getElementById("section-inventory");
    el.sectionReport = document.getElementById("section-report");
    el.inventoryBody = document.getElementById("inventory-tbody");
    el.reportBody = document.getElementById("report-body");
  }

  // --- Open / close --------------------------------------------------------

  function openManager() {
    lastFocused = document.activeElement;
    renderInventory();
    renderReport();
    showTab("inventory");
    el.overlay.hidden = false;
    el.close.focus(); // move keyboard focus into the dialog (accessibility)
    document.addEventListener("keydown", onKeydown);
  }

  function closeManager() {
    el.overlay.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus(); // return focus to where the user was
    }
  }

  /** Escape closes the dialog (UI-GUIDELINES section 17: modals must close). */
  function onKeydown(event) {
    if (event.key === "Escape") {
      closeManager();
    }
  }

  // --- Tabs ----------------------------------------------------------------

  function showTab(name) {
    var onInventory = name === "inventory";

    el.sectionInventory.hidden = !onInventory;
    el.sectionReport.hidden = onInventory;

    setTabActive(el.tabInventory, onInventory);
    setTabActive(el.tabReport, !onInventory);
  }

  function setTabActive(tab, active) {
    tab.className = active ? "manager__tab manager__tab--active" : "manager__tab";
    tab.setAttribute("aria-selected", active ? "true" : "false");
  }

  // --- Inventory tab -------------------------------------------------------

  /**
   * Decide the status shown for a product. Out of stock and low stock are both
   * derived from the same numbers the low-stock warning uses, so the table and
   * the warnings never disagree.
   */
  function statusFor(product) {
    var stock = Number(product.stockQuantity) || 0;
    var level = Number(product.lowStockLevel) || 0;
    if (stock <= 0) {
      return { label: "Out of stock", cls: "badge badge--out" };
    }
    if (stock <= level) {
      return { label: "Low stock", cls: "badge badge--low" };
    }
    return { label: "In stock", cls: "badge badge--ok" };
  }

  function renderInventory() {
    var products = storage.getInventoryProducts();
    el.inventoryBody.innerHTML = "";

    if (products.length === 0) {
      var emptyRow = make("tr");
      var emptyCell = make("td", "inv-table__empty", "No inventory products yet.");
      emptyCell.setAttribute("colspan", "5");
      emptyRow.appendChild(emptyCell);
      el.inventoryBody.appendChild(emptyRow);
      return;
    }

    for (var i = 0; i < products.length; i++) {
      var product = products[i];
      var status = statusFor(product);

      var row = make("tr");
      row.appendChild(make("td", "inv-table__name", product.name));
      row.appendChild(make("td", null, money.formatMoney(product.sellingPrice)));
      row.appendChild(make("td", null, String(product.stockQuantity)));
      row.appendChild(make("td", null, String(product.lowStockLevel)));

      var statusCell = make("td");
      statusCell.appendChild(make("span", status.cls, status.label));
      row.appendChild(statusCell);

      el.inventoryBody.appendChild(row);
    }
  }

  // --- Report tab ----------------------------------------------------------

  function renderReport() {
    var summary = reports.getDailySalesSummary();
    el.reportBody.innerHTML = "";

    el.reportBody.appendChild(buildStatCards(summary));
    el.reportBody.appendChild(buildBestSeller(summary));
    el.reportBody.appendChild(buildUnitsSold(summary));
    el.reportBody.appendChild(buildLowStock(summary));
  }

  function buildStatCards(summary) {
    var grid = make("div", "report-stats");
    grid.appendChild(statCard("Completed sales", String(summary.salesCount)));
    grid.appendChild(statCard("Total sales", money.formatMoney(summary.totalSales)));
    grid.appendChild(statCard("Cash received", money.formatMoney(summary.totalCashReceived)));
    return grid;
  }

  function statCard(label, value) {
    var card = make("div", "report-stat");
    card.appendChild(make("span", "report-stat__label", label));
    card.appendChild(make("span", "report-stat__value", value));
    return card;
  }

  function buildBestSeller(summary) {
    var block = make("div", "report-block");
    block.appendChild(make("h4", "report-block__title", "Best seller"));
    if (summary.bestSeller) {
      block.appendChild(
        make("p", null, summary.bestSeller.name + " (" + summary.bestSeller.units + " sold)")
      );
    } else {
      block.appendChild(make("p", "report-empty", "No sales yet today."));
    }
    return block;
  }

  function buildUnitsSold(summary) {
    var block = make("div", "report-block");
    block.appendChild(make("h4", "report-block__title", "Units sold by product"));

    if (summary.unitsByProduct.length === 0) {
      block.appendChild(make("p", "report-empty", "Nothing sold yet today."));
      return block;
    }

    var list = make("ul", "report-list");
    for (var i = 0; i < summary.unitsByProduct.length; i++) {
      var entry = summary.unitsByProduct[i];
      var rowItem = make("li", "report-list__row");
      rowItem.appendChild(make("span", null, entry.name));
      rowItem.appendChild(make("span", null, String(entry.units)));
      list.appendChild(rowItem);
    }
    block.appendChild(list);
    return block;
  }

  function buildLowStock(summary) {
    var block = make("div", "report-block");
    block.appendChild(make("h4", "report-block__title", "Low-stock products"));

    if (summary.lowStockProducts.length === 0) {
      block.appendChild(make("p", "report-empty", "All products are above their low-stock level."));
      return block;
    }

    var list = make("ul", "report-list");
    for (var i = 0; i < summary.lowStockProducts.length; i++) {
      var product = summary.lowStockProducts[i];
      var rowItem = make("li", "report-list__row");
      rowItem.appendChild(make("span", null, product.name));
      rowItem.appendChild(make("span", null, product.stockQuantity + " left"));
      list.appendChild(rowItem);
    }
    block.appendChild(list);
    return block;
  }

  // --- Startup -------------------------------------------------------------

  function init() {
    getElements();
    if (!el.overlay || !el.openButton) {
      return; // markup not present: do nothing rather than error
    }

    el.openButton.addEventListener("click", openManager);
    el.close.addEventListener("click", closeManager);
    el.tabInventory.addEventListener("click", function () { showTab("inventory"); });
    el.tabReport.addEventListener("click", function () { showTab("report"); });

    // Clicking the dark backdrop (but not the panel) closes the overlay.
    el.overlay.addEventListener("click", function (event) {
      if (event.target === el.overlay) {
        closeManager();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  // Exposed so it can be opened or re-rendered from the console during testing.
  global.GCK = global.GCK || {};
  global.GCK.managerView = {
    open: openManager,
    close: closeManager,
    renderInventory: renderInventory,
    renderReport: renderReport
  };
})(window);
