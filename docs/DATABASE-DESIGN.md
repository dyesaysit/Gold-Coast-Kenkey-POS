# Gold Coast Kenkey POS Data and Database Design

## 1. Purpose

This document defines the shared data model.

The first version may use JavaScript objects stored in LocalStorage or IndexedDB. The same model can later be moved to a real database.

The team must use one shared data structure. Do not create separate incompatible models in different features.

## 2. Core Entities

The main entities are:

- Category
- Menu Item
- Portion
- Protein Option
- Extra
- Inventory Product
- Cart Item
- Sale
- Sale Item
- User or Cashier
- Application Settings

## 3. Category

A category groups product tiles.

Example:

```javascript
{
  id: "rice-meals",
  name: "Rice Meals",
  displayOrder: 1,
  active: true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| name | string | Yes | Category name |
| displayOrder | number | Yes | Tile ordering |
| active | boolean | Yes | Whether category is visible |

## 4. Menu Item

A menu item represents a configured meal.

Example:

```javascript
{
  id: "jollof",
  name: "Jollof Rice",
  categoryId: "rice-meals",
  itemType: "configured-meal",
  image: "images/jollof.jpg",
  description: "Jollof rice served with a selected protein",
  active: true,
  portionIds: ["jollof-regular", "jollof-large"],
  allowedExtraIds: [
    "extra-rice",
    "extra-fish",
    "extra-chicken",
    "fried-egg"
  ]
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| name | string | Yes | Display name |
| categoryId | string | Yes | Parent category |
| itemType | string | Yes | Must be `configured-meal` |
| image | string | Yes | Image path |
| description | string | No | Short description |
| active | boolean | Yes | Visibility |
| portionIds | string[] | Yes | Allowed portions |
| allowedExtraIds | string[] | No | Allowed extras |

## 5. Portion

A portion contains the base price and included choices.

Example:

```javascript
{
  id: "jollof-regular",
  menuItemId: "jollof",
  name: "Regular Portion",
  price: 42,
  includedDescription: "3 scoops of rice",
  proteinRequired: true,
  allowedProteinIds: ["fish-cut", "chicken-leg"],
  active: true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| menuItemId | string | Yes | Parent meal |
| name | string | Yes | Portion name |
| price | number | Yes | Base price |
| includedDescription | string | No | Included serving |
| proteinRequired | boolean | Yes | Whether a choice is required |
| allowedProteinIds | string[] | No | Available proteins |
| active | boolean | Yes | Whether selectable |

## 6. Protein Option

Example:

```javascript
{
  id: "chicken-leg",
  name: "Chicken Leg",
  additionalPrice: 0,
  active: true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| name | string | Yes | Display name |
| additionalPrice | number | Yes | Extra charge, usually zero |
| active | boolean | Yes | Whether selectable |

## 7. Extra

Example:

```javascript
{
  id: "extra-rice",
  name: "Extra Rice Scoop",
  price: 5,
  maximumQuantity: 5,
  active: true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| name | string | Yes | Extra name |
| price | number | Yes | Unit price |
| maximumQuantity | number | Yes | Maximum allowed |
| active | boolean | Yes | Whether selectable |

## 8. Inventory Product

Example:

```javascript
{
  id: "pineapple-juice",
  name: "Pineapple Juice",
  categoryId: "drinks",
  itemType: "inventory-product",
  image: "images/pineapple-juice.jpg",
  sellingPrice: 12,
  stockQuantity: 30,
  lowStockLevel: 5,
  active: true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Unique identifier |
| name | string | Yes | Product name |
| categoryId | string | Yes | Parent category |
| itemType | string | Yes | Must be `inventory-product` |
| image | string | Yes | Image path |
| sellingPrice | number | Yes | Unit selling price |
| stockQuantity | number | Yes | Current stock |
| lowStockLevel | number | Yes | Warning threshold |
| active | boolean | Yes | Visibility |

## 9. Cart Item

A cart item is temporary.

### Configured meal cart item

```javascript
{
  id: "cart-170000000001",
  itemType: "configured-meal",
  productId: "jollof",
  productName: "Jollof Rice",
  image: "images/jollof.jpg",
  portion: {
    id: "jollof-regular",
    name: "Regular Portion",
    basePrice: 42
  },
  protein: {
    id: "chicken-leg",
    name: "Chicken Leg",
    additionalPrice: 0
  },
  extras: [
    {
      id: "extra-rice",
      name: "Extra Rice Scoop",
      unitPrice: 5,
      quantity: 2,
      total: 10
    }
  ],
  unitTotal: 52,
  quantity: 1,
  lineTotal: 52
}
```

### Inventory cart item

```javascript
{
  id: "cart-170000000002",
  itemType: "inventory-product",
  productId: "pineapple-juice",
  productName: "Pineapple Juice",
  image: "images/pineapple-juice.jpg",
  unitPrice: 12,
  quantity: 2,
  lineTotal: 24
}
```

## 10. Sale

A sale stores a completed transaction.

Example:

```javascript
{
  id: "sale-170000000001",
  receiptNumber: "GCK-20260802-0001",
  createdAt: "2026-08-02T18:30:00.000Z",
  cashier: {
    id: "cashier-1",
    name: "Omar"
  },
  items: [],
  subtotal: 76,
  discount: 0,
  total: 76,
  payment: {
    method: "cash",
    amountPaid: 100,
    change: 24
  },
  status: "completed"
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| id | string | Yes | Internal ID |
| receiptNumber | string | Yes | Human-readable number |
| createdAt | string | Yes | ISO date and time |
| cashier | object | No | Cashier snapshot |
| items | array | Yes | Sale item snapshots |
| subtotal | number | Yes | Before discount |
| discount | number | Yes | Version 1 may use zero |
| total | number | Yes | Final total |
| payment | object | Yes | Payment snapshot |
| status | string | Yes | `completed` |

## 11. Sale Item Snapshot

Completed sale items must store their own names and prices.

Do not save only product IDs.

Reason:

- Product names may change.
- Prices may change.
- Extras may change.
- Old receipts must remain accurate.

A sale item can reuse the cart-item structure with all final values included.

## 12. Cashier

Example:

```javascript
{
  id: "cashier-1",
  name: "Omar",
  pin: "1234",
  active: true
}
```

For a school project, PIN security may be simplified. Do not store real production passwords as plain text.

## 13. Application Settings

Example:

```javascript
{
  businessName: "Gold Coast Kenkey",
  currencyCode: "GHS",
  currencySymbol: "GH₵",
  receiptPrefix: "GCK",
  dataVersion: 1
}
```

## 14. LocalStorage Keys

Recommended keys:

```text
gckpos.categories
gckpos.menuItems
gckpos.portions
gckpos.proteins
gckpos.extras
gckpos.inventoryProducts
gckpos.sales
gckpos.cashiers
gckpos.settings
gckpos.currentCart
```

Do not use many unrelated key names.

## 15. Storage Service

Create one storage service.

Suggested functions:

```javascript
getCategories()
saveCategories(categories)

getMenuItems()
saveMenuItems(menuItems)

getInventoryProducts()
saveInventoryProducts(products)

getSales()
saveSale(sale)

getCurrentCart()
saveCurrentCart(cart)
clearCurrentCart()

seedInitialData()
```

UI components should call the service instead of directly manipulating LocalStorage everywhere.

## 16. Money Handling

For this school project:

- Use JavaScript numbers.
- Round to two decimal places after calculations.
- Use one helper function.

Example:

```javascript
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
```

All totals should pass through the same money helper.

## 17. Identifier Rules

IDs must be unique.

Simple version:

```javascript
function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
```

Receipt numbers should be human-readable and unique.

Example:

```text
GCK-20260802-0001
```

## 18. Stock Update Transaction

When a cash sale completes:

1. Validate the cart.
2. Validate payment.
3. Validate stock.
4. Create the sale snapshot.
5. Reduce stock for inventory products.
6. Save inventory.
7. Save the sale.
8. Clear the cart.
9. Show the receipt.

If a step fails, do not silently leave partially updated data.

For LocalStorage, prepare all updated objects before writing them.

## 19. Future Relational Database Mapping

The same model can later map to tables:

```text
categories
menu_items
portions
protein_options
extras
menu_item_extras
inventory_products
sales
sale_items
sale_item_extras
cashiers
settings
```

This future mapping is not required for the first version.
