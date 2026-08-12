/* Admin-only, versioned export and restore orchestration. */
(function (global) {
  "use strict";

  var FORMAT_NAME = "gckpos-backup";
  var FORMAT_VERSION = 1;
  var SUPPORTED_DATA_VERSIONS = [1, 2];
  var storage = global.GCK.storage;

  function denied(role) {
    return role !== "admin" ? { ok: false, code: "forbidden", message: "Admin access is required." } : null;
  }

  function pad(value) { return String(value).padStart(2, "0"); }

  function formatVisibleDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) { return "Unknown"; }
    return pad(date.getDate()) + "-" + pad(date.getMonth() + 1) + "-" + date.getFullYear() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function filenameFor(date) {
    return "GCKPOS-backup-" + pad(date.getDate()) + "-" + pad(date.getMonth() + 1) + "-" + date.getFullYear() + "-" + pad(date.getHours()) + pad(date.getMinutes()) + ".json";
  }

  function exportBackup(role, now) {
    var accessError = denied(role);
    if (accessError) { return accessError; }
    var snapshot = storage.getBackupData();
    if (!snapshot.ok) {
      return { ok: false, code: snapshot.code, message: "Backup could not be created because saved POS data is corrupt." };
    }
    var settings = snapshot.data[storage.KEYS.settings] || {};
    var date = now || new Date();
    var backup = {
      backupFormat: FORMAT_NAME,
      backupFormatVersion: FORMAT_VERSION,
      appDataVersion: Number(settings.dataVersion) || 1,
      exportedAt: date.toISOString(),
      businessName: settings.businessName || "",
      data: snapshot.data
    };
    return { ok: true, backup: backup, json: JSON.stringify(backup, null, 2), filename: filenameFor(date) };
  }

  function validateData(data) {
    var arrayKeys = ["categories", "menuItems", "portions", "proteins", "extras", "inventoryProducts", "sales", "cashiers"];
    if (!data || typeof data !== "object" || Array.isArray(data)) { return false; }
    for (var i = 0; i < arrayKeys.length; i++) {
      if (!Array.isArray(data[storage.KEYS[arrayKeys[i]]])) { return false; }
    }
    var settings = data[storage.KEYS.settings];
    return !!settings && typeof settings === "object" && !Array.isArray(settings);
  }

  function parseBackup(role, text) {
    var accessError = denied(role);
    if (accessError) { return accessError; }
    var backup;
    try { backup = JSON.parse(text); }
    catch (error) { return { ok: false, code: "corrupt-json", message: "This file is not valid JSON." }; }
    if (!backup || backup.backupFormat !== FORMAT_NAME) {
      return { ok: false, code: "wrong-schema", message: "This is not a Gold Coast Kenkey POS backup." };
    }
    if (backup.backupFormatVersion !== FORMAT_VERSION) {
      return { ok: false, code: "unsupported-version", message: "This backup version is not supported by this app." };
    }
    if (SUPPORTED_DATA_VERSIONS.indexOf(backup.appDataVersion) === -1) {
      return { ok: false, code: "unsupported-data-version", message: "This backup uses an unsupported POS data version." };
    }
    if (typeof backup.businessName !== "string" || typeof backup.exportedAt !== "string" || Number.isNaN(new Date(backup.exportedAt).getTime()) || !validateData(backup.data)) {
      return { ok: false, code: "wrong-schema", message: "The backup is missing required POS data or metadata." };
    }
    var inventory = backup.data[storage.KEYS.inventoryProducts];
    return {
      ok: true,
      backup: backup,
      preview: {
        businessName: backup.businessName || (backup.data[storage.KEYS.settings].businessName || "Not set"),
        backupDate: formatVisibleDate(backup.exportedAt),
        usersCount: backup.data[storage.KEYS.cashiers].length,
        productsCount: backup.data[storage.KEYS.menuItems].length + inventory.length,
        salesCount: backup.data[storage.KEYS.sales].length,
        inventoryProductsCount: inventory.length
      }
    };
  }

  function restoreBackup(role, backup, confirmed) {
    var accessError = denied(role);
    if (accessError) { return accessError; }
    if (confirmed !== true) { return { ok: false, code: "confirmation-required", message: "Confirm the restore before continuing." }; }
    var validation = parseBackup(role, JSON.stringify(backup));
    if (!validation.ok) { return validation; }
    var result = storage.restoreBackupData(backup.data);
    if (result.ok) { return result; }
    if (!result.rollbackSucceeded) {
      return { ok: false, code: result.code, message: "Restore failed and the previous data could not be fully recovered. Stop using the POS and recover from another backup." };
    }
    return { ok: false, code: result.code, message: result.code === "storage-capacity" ? "Restore failed because browser storage is full. Your previous POS data was restored." : "Restore could not be saved. Your previous POS data was restored." };
  }

  global.GCK = global.GCK || {};
  global.GCK.backup = {
    FORMAT_NAME: FORMAT_NAME,
    FORMAT_VERSION: FORMAT_VERSION,
    exportBackup: exportBackup,
    parseBackup: parseBackup,
    restoreBackup: restoreBackup,
    formatVisibleDate: formatVisibleDate
  };
})(window);
