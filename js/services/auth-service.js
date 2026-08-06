/*
 * auth-service.js
 * Shared login and access-control logic. Business logic only, no DOM.
 * The UI must validate every login through this service and must never read the
 * user list or session straight from localStorage.
 *
 * Access is role-based. Each role maps to the navigation items it may use:
 *   - cashier    -> POS only
 *   - supervisor -> POS, sales history, reports
 *   - admin      -> all available navigation items
 */
(function (global) {
  "use strict";

  var storage = global.GCK.storage;

  var MAX_PIN_LENGTH = 6;
  var MIN_PIN_LENGTH = 4;

  // The full set of navigation items the app knows about at this stage.
  var NAV_ITEMS = [
    { key: "pos", label: "POS" },
    { key: "sales-history", label: "Sales History" },
    { key: "reports", label: "Reports" },
    { key: "inventory", label: "Inventory" }
  ];

  // Which nav item keys each role may access. Admin gets every item.
  var ROLE_ACCESS = {
    cashier: ["pos"],
    supervisor: ["pos", "sales-history", "reports"],
    admin: NAV_ITEMS.map(function (item) { return item.key; })
  };

  /** Return a session-safe copy of a user. The PIN is never exposed. */
  function toSessionUser(user) {
    return { id: user.id, name: user.name, role: user.role };
  }

  /**
   * Shared login validation. Looks up an active user whose PIN matches.
   * Always returns the same shape: { valid, user, message }.
   * On success `user` is the session-safe snapshot (no PIN).
   */
  function validateLogin(pin) {
    var value = String(pin == null ? "" : pin);
    if (!/^[0-9]+$/.test(value) || value.length < MIN_PIN_LENGTH) {
      return { valid: false, user: null, message: "Enter your PIN." };
    }

    var users = storage.getCashiers();
    for (var i = 0; i < users.length; i++) {
      var user = users[i];
      if (user.active && String(user.pin) === value) {
        return { valid: true, user: toSessionUser(user), message: "" };
      }
    }
    return { valid: false, user: null, message: "Incorrect PIN. Try again." };
  }

  /**
   * Validate the PIN and, when valid, persist only the active user session
   * through the storage service. Returns the validation result.
   */
  function login(pin) {
    var result = validateLogin(pin);
    if (result.valid) {
      storage.saveSession(result.user);
    }
    return result;
  }

  function logout() {
    storage.clearSession();
  }

  /** The currently signed-in user snapshot, or null when logged out. */
  function getCurrentUser() {
    return storage.getSession();
  }

  /** True when the given role may access the given navigation item key. */
  function canAccess(role, navKey) {
    var allowed = ROLE_ACCESS[role] || [];
    return allowed.indexOf(navKey) !== -1;
  }

  /** The navigation items a role is allowed to see, in display order. */
  function getAccessibleNav(role) {
    return NAV_ITEMS.filter(function (item) {
      return canAccess(role, item.key);
    });
  }

  global.GCK = global.GCK || {};
  global.GCK.auth = {
    MAX_PIN_LENGTH: MAX_PIN_LENGTH,
    MIN_PIN_LENGTH: MIN_PIN_LENGTH,
    NAV_ITEMS: NAV_ITEMS,
    validateLogin: validateLogin,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    canAccess: canAccess,
    getAccessibleNav: getAccessibleNav
  };
})(window);
