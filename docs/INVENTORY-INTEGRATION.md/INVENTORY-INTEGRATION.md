# Inventory Integration Contract

Feature branch: `feature/inventory-reports` (Member 3)

This document defines the functions the **checkout feature** (Member 2,
`feature/cart-checkout-receipts`) calls to check and reduce stock. It exists so
that stock logic lives in one place and checkout never re-implements it
(AGENTS.md rules 4.5 and 5).

All functions are attached to the shared namespace: `window.GCK.inventory`.

---

## 1. Overview

Member 3 provides two functions checkout needs:

| Function | When checkout calls it | Purpose |
|---|---|---|
| `GCK.inventory.validateCartStock(cartItems)` | While validating the sale, **before** completing it | Confirm every drink in the cart has enough stock |
| `GCK.inventory.reduceInventoryStock(sale)` | **After** the sale is confirmed and its snapshot built | Subtract sold units from stock |

Two more functions exist but checkout does **not** need them; they are used by
Member 3's own Manager screen:

- `GCK.inventory.getLowStockProducts()` — products at or below their low-stock level.
- `GCK.reports.getDailySalesSummary(dateKey)` — the daily report.

---

## 2. `validateCartStock(cartItems)`

Call this during checkout validation (DATABASE-DESIGN.md section 18, step 3),
before the sale is allowed to complete.

**Input** — the current cart: an array of cart items. Only items with
`itemType: "inventory-product"` are checked; configured meals are ignored.
Each inventory cart item must provide:

| Field | Type | Notes |
|---|---|---|
| `itemType` | string | Must be `"inventory-product"` |
| `productId` | string | Must match an inventory product `id` |
| `quantity` | number | Positive whole number |

Quantities for the same `productId` across several lines are added together
before the check, so splitting a product across two lines cannot slip past it.

**Returns**

```javascript
{
  valid: true|false,
  message: "",                 // a ready-to-show message when valid is false
  shortages: [                 // empty when valid is true
    { productId: "water", requested: 3, available: 2 }
  ]
}
```

**How checkout should use it**

```javascript
var stockCheck = GCK.inventory.validateCartStock(cart);
if (!stockCheck.valid) {
  showMessage(stockCheck.message); // e.g. build a clearer line from shortages
  return;                          // do NOT complete the sale
}
```

This function only reads stock. It never changes stored data.

---

## 3. `reduceInventoryStock(sale)`

Call this once the sale is confirmed and the snapshot is created
(DATABASE-DESIGN.md section 18, step 5), never while building the cart.

**Input** — the completed `sale` object. The function reads `sale.items`. Only
`inventory-product` items reduce stock; meals never do. Each inventory item must
provide `productId` and `quantity` (the same fields as above).

**Returns**

```javascript
{ ok: true|false, message: "" } // message is filled only when ok is false
```

**Behaviour guarantees**

- All-or-nothing: it checks every reduction first and writes nothing if any one
  would fail, so stock is never left half-updated.
- Stock can never go negative.
- On success it saves the updated inventory through `GCK.storage`.

**How checkout should use it** — recommended order so a failure is safe:

```javascript
var sale = buildSaleSnapshot(cart, payment); // Member 2 builds this

var reduced = GCK.inventory.reduceInventoryStock(sale);
if (!reduced.ok) {
  showMessage(reduced.message);
  return;                     // do NOT save the sale, do NOT clear the cart
}

GCK.storage.saveSale(sale);   // only after stock reduced
GCK.storage.clearCurrentCart();
showReceipt(sale);
```

Because `validateCartStock` already ran during validation, `reduceInventoryStock`
failing on stock is extremely unlikely; the check is a safety net.

---

## 4. Who guarantees what

**Checkout (Member 2) must guarantee:**

- Every inventory line is tagged `itemType: "inventory-product"` with a real
  `productId` and a positive whole-number `quantity`.
- `reduceInventoryStock` is called **after** the sale is confirmed, and the sale
  is only saved / the cart only cleared when it returns `ok: true`.

**Inventory (Member 3) guarantees:**

- `validateCartStock` changes no stored data.
- `reduceInventoryStock` is all-or-nothing and never produces negative stock.
- Configured meals never affect stock, in either function.

---

## 5. Edge cases handled

| Situation | Result |
|---|---|
| Cart has only meals, no drinks | `validateCartStock` valid; `reduceInventoryStock` changes nothing |
| Same product on two lines | Quantities summed before checking / reducing |
| Requested exactly equals stock | Allowed; stock becomes 0 |
| Requested above stock | `valid:false` / `ok:false`; nothing written |
| Unknown `productId` | Reported as a shortage / failure |
| Empty or missing `items` | Treated as nothing to reduce |
