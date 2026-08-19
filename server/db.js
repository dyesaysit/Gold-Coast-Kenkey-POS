/*
 * server/db.js
 * Phase 2 database layer (see docs/ROADMAP.md, docs/DATABASE-DESIGN.md).
 *
 * A NORMALIZED relational SQLite schema with real foreign keys, so the model has
 * genuine relationships (visible in an ER diagram) rather than opaque JSON blobs:
 *
 *   categories 1---* menu_items 1---* portions
 *   categories 1---* inventory_products
 *   menu_items *---* extras            (via menu_item_extras)
 *   portions   *---* proteins          (via portion_proteins)
 *   cashiers   1---* sales   1---* sale_items
 *
 * The server maps between the client's nested objects (js/services/
 * storage-service.js) and these tables — decomposing on write, reassembling the
 * exact same object shapes on read — so the client, the API, and the backup file
 * all still share one model and existing backups import unchanged.
 *
 * Two deliberate, standard exceptions to full column normalization:
 *   - `settings` is singleton config with no relationships -> key/value table.
 *   - `sale_items.details` keeps each line's immutable snapshot (chosen portion,
 *     extras, protein) verbatim; receipts must never change when the catalogue
 *     later changes. The financial columns beside it are real and queryable.
 *
 * Foreign keys are DECLARED (so the schema/diagram expresses the relationships)
 * but not runtime-enforced, because the client writes whole collections at once
 * (replace-all) and manages integrity itself, exactly as in Phase 1.
 *
 * Zero external dependencies: Node's built-in node:sqlite (Node 22.5+).
 */
"use strict";

// node:sqlite is built into Node 22.5+ (run with --experimental-sqlite). Fail
// with a clear, actionable message rather than a cryptic module error if this
// runtime does not have it — this is the capability the Electron installer must
// provide (Electron 35+ bundles Node 22; otherwise spawn the system Node).
var DatabaseSync;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch (error) {
  throw new Error(
    "node:sqlite is unavailable in this Node runtime. Node 22.5+ is required " +
    "(start with --experimental-sqlite). For the packaged app use Electron 35+ " +
    "(bundles Node 22) or spawn the system Node. Underlying error: " + error.message
  );
}
if (typeof DatabaseSync !== "function") {
  throw new Error("node:sqlite loaded but DatabaseSync is missing; upgrade to Node 22.5+.");
}

var crypto = require("node:crypto");

// PINs are stored HASHED (scrypt + per-user salt), never in plaintext, so a
// leaked database file does not reveal them. Format: "<saltHex>:<hashHex>".
function hashPin(pin) {
  var salt = crypto.randomBytes(16).toString("hex");
  var hash = crypto.scryptSync(String(pin), salt, 32).toString("hex");
  return salt + ":" + hash;
}
function verifyPinHash(pin, stored) {
  if (!stored || String(stored).indexOf(":") === -1) { return false; }
  var parts = String(stored).split(":");
  var expected = Buffer.from(parts[1], "hex");
  var actual = crypto.scryptSync(String(pin), parts[0], 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// storage key <-> collection name, matching storage-service.js KEYS exactly.
var COLLECTIONS = [
  { name: "categories", key: "gckpos.categories" },
  { name: "menuItems", key: "gckpos.menuItems" },
  { name: "portions", key: "gckpos.portions" },
  { name: "proteins", key: "gckpos.proteins" },
  { name: "extras", key: "gckpos.extras" },
  { name: "inventoryProducts", key: "gckpos.inventoryProducts" },
  { name: "cashiers", key: "gckpos.cashiers" },
  { name: "sales", key: "gckpos.sales" },
  { name: "settings", key: "gckpos.settings" }
];
var KEYS = {};
COLLECTIONS.forEach(function (c) { KEYS[c.name] = c.key; });

// Backup format constants — must match js/services/backup-service.js.
var BACKUP_FORMAT_NAME = "gckpos-backup";
var BACKUP_FORMAT_VERSION = 1;
var SUPPORTED_DATA_VERSIONS = [1, 2];

// --- small value helpers -------------------------------------------------
function to01(v) { return v ? 1 : 0; }            // boolean -> INTEGER
function toBool(v) { return v === 1 || v === true; } // INTEGER -> boolean
function orNull(v) { return v === undefined ? null : v; }
function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
// Store an OPTIONAL field: null when the key is absent, else the value.
function optField(obj, key) { return has(obj, key) ? orNull(obj[key]) : null; }

function pad(value, width) {
  var s = String(value);
  while (s.length < width) { s = "0" + s; }
  return s;
}

var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS categories (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, display_order INTEGER, active INTEGER)",

  "CREATE TABLE IF NOT EXISTS cashiers (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT, role TEXT, active INTEGER)",

  "CREATE TABLE IF NOT EXISTS proteins (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, additional_price REAL, active INTEGER)",

  "CREATE TABLE IF NOT EXISTS extras (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL, maximum_quantity INTEGER, active INTEGER)",

  "CREATE TABLE IF NOT EXISTS menu_items (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, " +
    "category_id TEXT REFERENCES categories(id), item_type TEXT, image TEXT, description TEXT, " +
    "active INTEGER, popular INTEGER, product_type TEXT, track_inventory INTEGER, " +
    "stock_quantity INTEGER, low_stock_level INTEGER)",

  "CREATE TABLE IF NOT EXISTS portions (" +
    "id TEXT PRIMARY KEY, menu_item_id TEXT REFERENCES menu_items(id), name TEXT NOT NULL, " +
    "price REAL, included_description TEXT, protein_required INTEGER, active INTEGER)",

  "CREATE TABLE IF NOT EXISTS inventory_products (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT REFERENCES categories(id), " +
    "item_type TEXT, image TEXT, selling_price REAL, stock_quantity INTEGER, low_stock_level INTEGER, " +
    "active INTEGER, popular INTEGER, product_type TEXT, track_inventory INTEGER)",

  "CREATE TABLE IF NOT EXISTS menu_item_extras (" +
    "menu_item_id TEXT REFERENCES menu_items(id), extra_id TEXT REFERENCES extras(id), " +
    "PRIMARY KEY (menu_item_id, extra_id))",

  "CREATE TABLE IF NOT EXISTS portion_proteins (" +
    "portion_id TEXT REFERENCES portions(id), protein_id TEXT REFERENCES proteins(id), " +
    "PRIMARY KEY (portion_id, protein_id))",

  "CREATE TABLE IF NOT EXISTS sales (" +
    "id TEXT PRIMARY KEY, receipt_number TEXT, created_at TEXT, " +
    "cashier_id TEXT REFERENCES cashiers(id), cashier_name TEXT, " +
    "subtotal REAL, discount REAL, total REAL, " +
    "payment_method TEXT, payment_amount_paid REAL, payment_change REAL, payment_reference TEXT, " +
    "status TEXT, receipt_settings TEXT)",

  "CREATE TABLE IF NOT EXISTS sale_items (" +
    "seq INTEGER PRIMARY KEY AUTOINCREMENT, sale_id TEXT REFERENCES sales(id), " +
    "product_id TEXT, product_name TEXT, item_type TEXT, quantity INTEGER, " +
    "unit_price REAL, line_total REAL, track_inventory INTEGER, details TEXT)",

  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",

  "CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_number)",
  "CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)",
  "CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id)",
  "CREATE INDEX IF NOT EXISTS idx_portions_menu_item ON portions(menu_item_id)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_products(category_id)"
];

function collectionByKey(key) {
  for (var i = 0; i < COLLECTIONS.length; i++) { if (COLLECTIONS[i].key === key) { return COLLECTIONS[i]; } }
  return null;
}
function collectionByName(name) {
  for (var i = 0; i < COLLECTIONS.length; i++) { if (COLLECTIONS[i].name === name) { return COLLECTIONS[i]; } }
  return null;
}

/**
 * Open (or create) a database at the given file path (":memory:" for tests)
 * and return a data-access API bound to it. The API mirrors Phase 1's storage
 * contract, so server.js and the client are unchanged.
 */
function open(filePath) {
  // Foreign keys are DECLARED for the schema/diagram but not runtime-enforced:
  // the client saves whole collections at once (replace-all), so a strict engine
  // would reject wiping a referenced table mid-transaction. Integrity is managed
  // by the client, exactly as in Phase 1.
  var db = new DatabaseSync(filePath, { enableForeignKeyConstraints: false });
  db.exec("PRAGMA journal_mode = WAL");

  // Upgrade guard: rebuild databases from earlier incompatible layouts — the
  // original (seq, doc) JSON blobs, or the first normalized schema that stored a
  // plaintext `pin` column (before PIN hashing). Data returns via a JSON backup
  // restore (the backup format is schema-independent).
  var categoriesInfo = db.prepare("PRAGMA table_info(categories)").all();
  var cashiersInfo = db.prepare("PRAGMA table_info(cashiers)").all();
  var isOldSchema = categoriesInfo.some(function (c) { return c.name === "doc"; }) ||
    cashiersInfo.some(function (c) { return c.name === "pin"; });
  if (isOldSchema) {
    ["categories", "menu_items", "portions", "proteins", "extras", "inventory_products",
     "cashiers", "sales", "settings", "menu_item_extras", "portion_proteins", "sale_items"]
      .forEach(function (t) { db.exec("DROP TABLE IF EXISTS " + t); });
  }

  SCHEMA.forEach(function (sql) { db.exec(sql); });

  function transaction(work) {
    db.exec("BEGIN");
    try { var r = work(); db.exec("COMMIT"); return r; }
    catch (error) { try { db.exec("ROLLBACK"); } catch (e) { /* already failing */ } throw error; }
  }

  // --- reassembly (rows -> client objects) -------------------------------

  function readCategories() {
    return db.prepare("SELECT * FROM categories ORDER BY rowid").all().map(function (r) {
      return { id: r.id, name: r.name, displayOrder: r.display_order, active: toBool(r.active) };
    });
  }

  // Bootstrap reads (includeSecret=false) never expose the hash; only backup
  // export (includeSecret=true) includes pinHash so a restore keeps logins.
  function readCashiers(includeSecret) {
    return db.prepare("SELECT * FROM cashiers ORDER BY rowid").all().map(function (r) {
      var c = { id: r.id, name: r.name, role: r.role, active: toBool(r.active) };
      if (includeSecret) { c.pinHash = r.pin_hash; }
      return c;
    });
  }

  function readProteins() {
    return db.prepare("SELECT * FROM proteins ORDER BY rowid").all().map(function (r) {
      return { id: r.id, name: r.name, additionalPrice: r.additional_price, active: toBool(r.active) };
    });
  }

  function readExtras() {
    return db.prepare("SELECT * FROM extras ORDER BY rowid").all().map(function (r) {
      return { id: r.id, name: r.name, price: r.price, maximumQuantity: r.maximum_quantity, active: toBool(r.active) };
    });
  }

  function extraIdsForMenuItem(menuItemId) {
    return db.prepare("SELECT extra_id FROM menu_item_extras WHERE menu_item_id = ? ORDER BY rowid")
      .all(menuItemId).map(function (r) { return r.extra_id; });
  }
  function proteinIdsForPortion(portionId) {
    return db.prepare("SELECT protein_id FROM portion_proteins WHERE portion_id = ? ORDER BY rowid")
      .all(portionId).map(function (r) { return r.protein_id; });
  }
  function portionIdsForMenuItem(menuItemId) {
    return db.prepare("SELECT id FROM portions WHERE menu_item_id = ? ORDER BY rowid")
      .all(menuItemId).map(function (r) { return r.id; });
  }

  function readMenuItems() {
    return db.prepare("SELECT * FROM menu_items ORDER BY rowid").all().map(function (r) {
      var meal = { id: r.id, name: r.name };
      if (r.popular) { meal.popular = true; }
      meal.categoryId = r.category_id;
      meal.itemType = r.item_type;
      meal.image = r.image === null ? "" : r.image;
      if (r.description !== null) { meal.description = r.description; }
      meal.active = toBool(r.active);
      meal.portionIds = portionIdsForMenuItem(r.id);
      meal.allowedExtraIds = extraIdsForMenuItem(r.id);
      meal.productType = r.product_type;
      meal.trackInventory = toBool(r.track_inventory);
      meal.stockQuantity = r.stock_quantity; // meals: null by contract
      meal.lowStockLevel = r.low_stock_level;
      return meal;
    });
  }

  function readPortions() {
    return db.prepare("SELECT * FROM portions ORDER BY rowid").all().map(function (r) {
      return {
        id: r.id,
        menuItemId: r.menu_item_id,
        name: r.name,
        price: r.price,
        includedDescription: r.included_description === null ? "" : r.included_description,
        proteinRequired: toBool(r.protein_required),
        allowedProteinIds: proteinIdsForPortion(r.id),
        active: toBool(r.active)
      };
    });
  }

  function readInventoryProducts() {
    return db.prepare("SELECT * FROM inventory_products ORDER BY rowid").all().map(function (r) {
      var p = { id: r.id, name: r.name, categoryId: r.category_id, itemType: r.item_type };
      p.image = r.image === null ? "" : r.image;
      p.sellingPrice = r.selling_price;
      if (r.stock_quantity !== null) { p.stockQuantity = r.stock_quantity; }
      if (r.low_stock_level !== null) { p.lowStockLevel = r.low_stock_level; }
      p.active = toBool(r.active);
      if (r.popular) { p.popular = true; }
      p.productType = r.product_type;
      p.trackInventory = toBool(r.track_inventory);
      return p;
    });
  }

  function readSettings() {
    var rows = db.prepare("SELECT key, value FROM settings").all();
    if (rows.length === 0) { return null; }
    var out = {};
    rows.forEach(function (r) { out[r.key] = JSON.parse(r.value); });
    return out;
  }

  function readSaleItems(saleId) {
    return db.prepare("SELECT details FROM sale_items WHERE sale_id = ? ORDER BY seq").all(saleId)
      .map(function (r) { return JSON.parse(r.details); });
  }

  function rowToSale(r) {
    var sale = { id: r.id, receiptNumber: r.receipt_number, createdAt: r.created_at };
    if (r.cashier_id !== null || r.cashier_name !== null) {
      sale.cashier = { id: r.cashier_id, name: r.cashier_name };
    } else {
      sale.cashier = null;
    }
    sale.items = readSaleItems(r.id);
    if (r.subtotal !== null) { sale.subtotal = r.subtotal; }
    if (r.discount !== null) { sale.discount = r.discount; }
    sale.total = r.total;
    if (r.payment_method !== null) {
      var payment = { method: r.payment_method, amountPaid: r.payment_amount_paid, change: r.payment_change };
      if (r.payment_reference !== null) { payment.reference = r.payment_reference; }
      sale.payment = payment;
    }
    if (r.receipt_settings !== null) { sale.receiptSettings = JSON.parse(r.receipt_settings); }
    if (r.status !== null) { sale.status = r.status; }
    return sale;
  }

  function readSales() {
    return db.prepare("SELECT * FROM sales ORDER BY rowid").all().map(rowToSale);
  }

  // --- decomposition (client objects -> rows) — no own transaction -------

  function fillCategories(items) {
    db.exec("DELETE FROM categories");
    var ins = db.prepare("INSERT INTO categories (id, name, display_order, active) VALUES (?, ?, ?, ?)");
    (items || []).forEach(function (c) { ins.run(c.id, c.name, orNull(c.displayOrder), to01(c.active)); });
  }
  function fillCashiers(items) {
    // Preserve existing hashes so a save that omits PINs (the client cache never
    // holds them) does not wipe them. A plaintext `pin` is hashed; a `pinHash`
    // (from a server backup) is kept verbatim.
    var existing = {};
    db.prepare("SELECT id, pin_hash FROM cashiers").all().forEach(function (r) { existing[r.id] = r.pin_hash; });
    db.exec("DELETE FROM cashiers");
    var ins = db.prepare("INSERT INTO cashiers (id, name, pin_hash, role, active) VALUES (?, ?, ?, ?, ?)");
    (items || []).forEach(function (c) {
      var pinHash;
      if (c.pin !== undefined && c.pin !== null && c.pin !== "") { pinHash = hashPin(c.pin); }
      else if (c.pinHash) { pinHash = c.pinHash; }
      else { pinHash = existing[c.id] || null; }
      ins.run(c.id, c.name, pinHash, orNull(c.role), to01(c.active));
    });
  }
  function fillProteins(items) {
    db.exec("DELETE FROM proteins");
    var ins = db.prepare("INSERT INTO proteins (id, name, additional_price, active) VALUES (?, ?, ?, ?)");
    (items || []).forEach(function (p) { ins.run(p.id, p.name, orNull(p.additionalPrice), to01(p.active)); });
  }
  function fillExtras(items) {
    db.exec("DELETE FROM extras");
    var ins = db.prepare("INSERT INTO extras (id, name, price, maximum_quantity, active) VALUES (?, ?, ?, ?, ?)");
    (items || []).forEach(function (e) { ins.run(e.id, e.name, orNull(e.price), orNull(e.maximumQuantity), to01(e.active)); });
  }
  function fillMenuItems(items) {
    db.exec("DELETE FROM menu_items");
    db.exec("DELETE FROM menu_item_extras");
    var ins = db.prepare("INSERT INTO menu_items (id, name, category_id, item_type, image, description, active, popular, product_type, track_inventory, stock_quantity, low_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    var insExtra = db.prepare("INSERT OR IGNORE INTO menu_item_extras (menu_item_id, extra_id) VALUES (?, ?)");
    (items || []).forEach(function (m) {
      ins.run(m.id, m.name, orNull(m.categoryId), orNull(m.itemType), optField(m, "image"),
        optField(m, "description"), to01(m.active), m.popular ? 1 : null, orNull(m.productType),
        to01(m.trackInventory), optField(m, "stockQuantity"), optField(m, "lowStockLevel"));
      (m.allowedExtraIds || []).forEach(function (extraId) { insExtra.run(m.id, extraId); });
    });
  }
  function fillPortions(items) {
    db.exec("DELETE FROM portions");
    db.exec("DELETE FROM portion_proteins");
    var ins = db.prepare("INSERT INTO portions (id, menu_item_id, name, price, included_description, protein_required, active) VALUES (?, ?, ?, ?, ?, ?, ?)");
    var insProtein = db.prepare("INSERT OR IGNORE INTO portion_proteins (portion_id, protein_id) VALUES (?, ?)");
    (items || []).forEach(function (p) {
      ins.run(p.id, orNull(p.menuItemId), p.name, orNull(p.price), optField(p, "includedDescription"),
        to01(p.proteinRequired), to01(p.active));
      (p.allowedProteinIds || []).forEach(function (proteinId) { insProtein.run(p.id, proteinId); });
    });
  }
  function fillInventoryProducts(items) {
    db.exec("DELETE FROM inventory_products");
    var ins = db.prepare("INSERT INTO inventory_products (id, name, category_id, item_type, image, selling_price, stock_quantity, low_stock_level, active, popular, product_type, track_inventory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    (items || []).forEach(function (p) {
      ins.run(p.id, p.name, orNull(p.categoryId), orNull(p.itemType), optField(p, "image"),
        orNull(p.sellingPrice), optField(p, "stockQuantity"), optField(p, "lowStockLevel"),
        to01(p.active), p.popular ? 1 : null, orNull(p.productType), to01(p.trackInventory));
    });
  }
  function writeSettings(obj) {
    db.exec("DELETE FROM settings");
    if (!obj) { return; }
    var ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    Object.keys(obj).forEach(function (key) { ins.run(key, JSON.stringify(obj[key])); });
  }

  function insertSaleRow(sale) {
    var cashier = sale.cashier || null;
    var payment = sale.payment || null;
    db.prepare("INSERT INTO sales (id, receipt_number, created_at, cashier_id, cashier_name, subtotal, discount, total, payment_method, payment_amount_paid, payment_change, payment_reference, status, receipt_settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        orNull(sale.id), orNull(sale.receiptNumber), orNull(sale.createdAt),
        cashier ? orNull(cashier.id) : null, cashier ? orNull(cashier.name) : null,
        optField(sale, "subtotal"), optField(sale, "discount"), orNull(sale.total),
        payment ? orNull(payment.method) : null, payment ? orNull(payment.amountPaid) : null,
        payment ? orNull(payment.change) : null, payment ? optField(payment, "reference") : null,
        optField(sale, "status"),
        has(sale, "receiptSettings") && sale.receiptSettings ? JSON.stringify(sale.receiptSettings) : null
      );
    var insItem = db.prepare("INSERT INTO sale_items (sale_id, product_id, product_name, item_type, quantity, unit_price, line_total, track_inventory, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    (sale.items || []).forEach(function (item) {
      var unitPrice = has(item, "unitTotal") ? item.unitTotal : (has(item, "unitPrice") ? item.unitPrice : null);
      insItem.run(sale.id || null, orNull(item.productId), optField(item, "productName"),
        optField(item, "itemType"), orNull(item.quantity), orNull(unitPrice), optField(item, "lineTotal"),
        has(item, "trackInventory") ? to01(item.trackInventory) : null, JSON.stringify(item));
    });
  }
  function fillSales(items) {
    db.exec("DELETE FROM sale_items");
    db.exec("DELETE FROM sales");
    (items || []).forEach(insertSaleRow);
  }

  // --- public reads ------------------------------------------------------

  function getCollection(name) {
    switch (name) {
      case "categories": return readCategories();
      case "menuItems": return readMenuItems();
      case "portions": return readPortions();
      case "proteins": return readProteins();
      case "extras": return readExtras();
      case "inventoryProducts": return readInventoryProducts();
      case "cashiers": return readCashiers();
      case "sales": return readSales();
      case "settings": return readSettings();
      default: return null;
    }
  }

  function getAll() {
    var data = {};
    COLLECTIONS.forEach(function (c) { data[c.key] = getCollection(c.name); });
    return data;
  }

  function getSettings() { return readSettings(); }
  function getSales() { return readSales(); }

  function anyCashier() { return db.prepare("SELECT COUNT(*) AS n FROM cashiers").get().n > 0; }

  // Verify a PIN against active users' stored hashes. Returns the session-safe
  // user (id, name, role) on success, or null. Used by /api/login server-side.
  function verifyLogin(pin) {
    var rows = db.prepare("SELECT id, name, role, active, pin_hash FROM cashiers").all();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].active && verifyPinHash(pin, rows[i].pin_hash)) {
        return { id: rows[i].id, name: rows[i].name, role: rows[i].role };
      }
    }
    return null;
  }

  function isEmpty() {
    var tables = ["categories", "cashiers", "proteins", "extras", "menu_items", "portions", "inventory_products", "sales", "settings"];
    for (var i = 0; i < tables.length; i++) {
      if (db.prepare("SELECT COUNT(*) AS n FROM " + tables[i]).get().n > 0) { return false; }
    }
    return true;
  }

  // --- public writes -----------------------------------------------------

  function fillCollection(name, value) {
    switch (name) {
      case "categories": fillCategories(value); break;
      case "menuItems": fillMenuItems(value); break;
      case "portions": fillPortions(value); break;
      case "proteins": fillProteins(value); break;
      case "extras": fillExtras(value); break;
      case "inventoryProducts": fillInventoryProducts(value); break;
      case "cashiers": fillCashiers(value); break;
      case "sales": fillSales(value); break;
      case "settings": writeSettings(value); break;
      default: throw new Error("Unknown collection: " + name);
    }
  }

  function replaceCollection(name, value) {
    if (!collectionByName(name)) { throw new Error("Unknown collection: " + name); }
    return transaction(function () { fillCollection(name, value); return true; });
  }

  function replaceCollectionByKey(key, value) {
    var col = collectionByKey(key);
    if (!col) { throw new Error("Unknown storage key: " + key); }
    return replaceCollection(col.name, value);
  }

  function saveSettings(settings) {
    return transaction(function () { writeSettings(settings); return true; });
  }

  // --- receipt numbering (server-owned, safe across devices) -------------

  function generateReceiptNumber(now) {
    var settings = readSettings() || {};
    var prefix = settings.receiptPrefix || "GCK";
    var datePart = "" + now.getFullYear() + pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2);
    var todayPrefix = prefix + "-" + datePart + "-";
    var row = db.prepare("SELECT COUNT(*) AS n FROM sales WHERE receipt_number LIKE ?").get(todayPrefix + "%");
    return todayPrefix + pad(row.n + 1, 4);
  }

  /**
   * Complete a sale atomically: assign a receipt number if missing, decrement
   * stock for tracked items with a real UPDATE, and insert the sale + its line
   * items — all in one transaction. Returns { sale, inventory }.
   */
  function completeSale(sale, now) {
    now = now || new Date();
    return transaction(function () {
      var stored = {};
      Object.keys(sale).forEach(function (k) { stored[k] = sale[k]; });
      if (!stored.receiptNumber) { stored.receiptNumber = generateReceiptNumber(now); }
      if (!stored.createdAt) { stored.createdAt = now.toISOString(); }

      var decrement = db.prepare("UPDATE inventory_products SET stock_quantity = max(0, stock_quantity - ?) WHERE id = ? AND stock_quantity IS NOT NULL");
      (stored.items || []).forEach(function (item) {
        var tracked = (typeof item.trackInventory === "boolean") ? item.trackInventory : item.itemType === "inventory-product";
        if (tracked && item.productId) { decrement.run(Number(item.quantity), item.productId); }
      });

      insertSaleRow(stored);
      return { sale: stored, inventory: readInventoryProducts() };
    });
  }

  // --- seeding -----------------------------------------------------------

  function seedIfEmpty(seed) {
    if (!seed || !isEmpty()) { return false; }
    return transaction(function () {
      fillCategories(seed.categories);
      fillCashiers(seed.cashiers);
      fillProteins(seed.proteins);
      fillExtras(seed.extras);
      fillMenuItems(seed.menuItems);
      fillPortions(seed.portions);
      fillInventoryProducts(seed.inventoryProducts);
      writeSettings(seed.settings);
      return true;
    });
  }

  // --- backup / restore (same file format as the client) -----------------

  function exportBackup(now) {
    now = now || new Date();
    var data = getAll();
    var settings = data[KEYS.settings] || {};
    data[KEYS.settings] = settings;
    // Include the PIN hashes in a backup so a restore keeps logins working
    // (bootstrap never exposes them).
    data[KEYS.cashiers] = readCashiers(true);
    return {
      backupFormat: BACKUP_FORMAT_NAME,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      appDataVersion: Number(settings.dataVersion) || 1,
      exportedAt: now.toISOString(),
      businessName: settings.businessName || "",
      data: data
    };
  }

  function validateBackupData(data) {
    var arrayKeys = ["categories", "menuItems", "portions", "proteins", "extras", "inventoryProducts", "sales", "cashiers"];
    if (!data || typeof data !== "object" || Array.isArray(data)) { return false; }
    for (var i = 0; i < arrayKeys.length; i++) {
      if (!Array.isArray(data[KEYS[arrayKeys[i]]])) { return false; }
    }
    var settings = data[KEYS.settings];
    return !!settings && typeof settings === "object" && !Array.isArray(settings);
  }

  function importBackup(backup) {
    if (!backup || backup.backupFormat !== BACKUP_FORMAT_NAME) {
      return { ok: false, code: "wrong-schema", message: "This is not a Gold Coast Kenkey POS backup." };
    }
    if (backup.backupFormatVersion !== BACKUP_FORMAT_VERSION) {
      return { ok: false, code: "unsupported-version", message: "This backup version is not supported." };
    }
    if (SUPPORTED_DATA_VERSIONS.indexOf(backup.appDataVersion) === -1) {
      return { ok: false, code: "unsupported-data-version", message: "This backup uses an unsupported data version." };
    }
    if (!validateBackupData(backup.data)) {
      return { ok: false, code: "wrong-schema", message: "The backup is missing required POS data." };
    }
    try {
      transaction(function () {
        fillCategories(backup.data[KEYS.categories]);
        fillCashiers(backup.data[KEYS.cashiers]);
        fillProteins(backup.data[KEYS.proteins]);
        fillExtras(backup.data[KEYS.extras]);
        fillMenuItems(backup.data[KEYS.menuItems]);
        fillPortions(backup.data[KEYS.portions]);
        fillInventoryProducts(backup.data[KEYS.inventoryProducts]);
        fillSales(backup.data[KEYS.sales]);
        writeSettings(backup.data[KEYS.settings]);
        return true;
      });
      return { ok: true };
    } catch (error) {
      // Log the detail server-side; return a generic message (no internals).
      console.error("Restore failed:", error);
      return { ok: false, code: "write-failed", message: "Restore could not be saved." };
    }
  }

  function close() { db.close(); }

  return {
    KEYS: KEYS,
    COLLECTIONS: COLLECTIONS,
    getCollection: getCollection,
    getAll: getAll,
    verifyLogin: verifyLogin,
    anyCashier: anyCashier,
    getSettings: getSettings,
    getSales: getSales,
    isEmpty: isEmpty,
    replaceCollection: replaceCollection,
    replaceCollectionByKey: replaceCollectionByKey,
    saveSettings: saveSettings,
    generateReceiptNumber: generateReceiptNumber,
    completeSale: completeSale,
    seedIfEmpty: seedIfEmpty,
    exportBackup: exportBackup,
    importBackup: importBackup,
    close: close
  };
}

module.exports = {
  open: open,
  COLLECTIONS: COLLECTIONS,
  KEYS: KEYS,
  BACKUP_FORMAT_NAME: BACKUP_FORMAT_NAME,
  BACKUP_FORMAT_VERSION: BACKUP_FORMAT_VERSION
};
