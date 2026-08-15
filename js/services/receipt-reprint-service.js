/*
 * receipt-reprint-service.js
 * Cashier-safe receipt reprint lookup. Read-only.
 *
 * Finds a single completed sale by its receipt number or MoMo reference so its
 * receipt can be reprinted for a returning customer.
 *
 * Permission isolation: a cashier can only reach their OWN sales; supervisors
 * and admins (who already have full Sales History) may reach any sale. This
 * service never exposes totals, reports, or other cashiers' history - it only
 * returns one matching sale (or a short list of the user's own recent sales)
 * for the existing receipt renderer to display.
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;

  function canSeeAllSales(role) {
    return role === "supervisor" || role === "admin";
  }

  /** The sales a user is permitted to reprint. Cashiers see only their own. */
  function visibleSales(user) {
    if (!user) {
      return [];
    }
    var sales = storage.getSales();
    if (!Array.isArray(sales)) {
      return [];
    }
    if (canSeeAllSales(user.role)) {
      return sales;
    }
    return sales.filter(function (sale) {
      return sale && sale.cashier && sale.cashier.id === user.id;
    });
  }

  function normalize(value) {
    return String(value == null ? "" : value).trim().toUpperCase();
  }

  /** Exact match on receipt number OR MoMo reference (no partial matches). */
  function matchesQuery(sale, normalizedQuery) {
    if (normalize(sale.receiptNumber) === normalizedQuery) {
      return true;
    }
    var reference = sale.payment && sale.payment.reference;
    return reference ? normalize(reference) === normalizedQuery : false;
  }

  function completedTime(sale) {
    var time = new Date(sale.createdAt).getTime();
    return isNaN(time) ? 0 : time;
  }

  /**
   * Find a reprintable sale for this user by receipt number or reference.
   * Returns { status: "empty" | "not-found" | "found", sale, duplicateCount }.
   */
  function findSale(query, user) {
    var normalized = normalize(query);
    if (!normalized) {
      return { status: "empty", sale: null };
    }
    var matches = visibleSales(user).filter(function (sale) {
      return sale && sale.status === "completed" && matchesQuery(sale, normalized);
    });
    if (matches.length === 0) {
      return { status: "not-found", sale: null };
    }
    // Reference-safe on the rare duplicate: reprint the most recent match.
    var sorted = matches.slice().sort(function (a, b) {
      return completedTime(a) - completedTime(b);
    });
    return {
      status: "found",
      sale: sorted[sorted.length - 1],
      duplicateCount: matches.length
    };
  }

  function isSameDay(iso, reference) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return false;
    }
    return date.getFullYear() === reference.getFullYear() &&
      date.getMonth() === reference.getMonth() &&
      date.getDate() === reference.getDate();
  }

  /**
   * The user's recent completed sales, most recent first. When todayOnly is
   * true, only sales from the reference day are returned. `reference` defaults
   * to now; tests pass it explicitly to stay deterministic.
   */
  function getRecentSales(user, todayOnly, limit, reference) {
    var ref = reference || new Date();
    var sales = visibleSales(user).filter(function (sale) {
      return sale && sale.status === "completed";
    });
    if (todayOnly) {
      sales = sales.filter(function (sale) {
        return isSameDay(sale.createdAt, ref);
      });
    }
    sales.sort(function (a, b) {
      return completedTime(b) - completedTime(a);
    });
    return sales.slice(0, limit || 8);
  }

  global.GCK = global.GCK || {};
  global.GCK.receiptReprint = {
    canSeeAllSales: canSeeAllSales,
    findSale: findSale,
    getRecentSales: getRecentSales
  };
})(window);
