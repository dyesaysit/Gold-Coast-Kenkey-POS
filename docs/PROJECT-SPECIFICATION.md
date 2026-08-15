# Gold Coast Kenkey POS Project Specification

## 1. Project Overview

Gold Coast Kenkey POS is a lightweight, image-based Point of Sale system for a Ghanaian food joint with a small menu.

The system must support:

- Food sold in predefined portions.
- Different portion prices.
- Included protein choices.
- Optional extras with additional charges.
- Extra quantities.
- Inventory-tracked drinks and packaged products.
- Cash checkout.
- Receipts.
- Sales history.
- Basic daily reports.

The project is an Introduction to Programming group assignment. Simplicity, correctness, readability, and explainability are more important than adding many features.

## 2. Problem Statement

The food joint does not sell every item as a simple fixed-price product.

A meal such as Jollof Rice may have:

- A regular portion price.
- A number of included rice scoops.
- One included fish cut or chicken leg.
- Optional extra rice.
- Optional extra fish.
- Optional extra chicken.
- Optional fried egg.
- Other optional accompaniments.

The POS must allow the cashier to configure the meal without creating a separate product tile for every possible combination.

Drinks and packaged products must be treated as inventory items because their available quantities can be counted.

## 3. Project Objectives

The system must:

1. Make sales entry fast.
2. Use large tiles with food pictures.
3. Handle portion-based meals.
4. Handle protein choices.
5. Handle optional extras and quantities.
6. Calculate totals accurately.
7. Track stock for inventory products.
8. Save completed sales.
9. Generate readable receipts.
10. Display a basic daily summary.
11. Work on common laptop and mobile screen sizes.
12. Remain simple enough for the group to explain.

## 4. User Roles

- Cashier: POS only.
- Supervisor: POS, Products, Inventory, Sales History, and Reports.
- Admin: all sections, including Users and Settings.

Users and Settings must enforce admin access in application logic as well as navigation visibility.

## 5. Product Types

The system has two product types.

### 5.1 Configured meal

A configured meal:

- Has a name.
- Has an image.
- Belongs to a category.
- Has one or more portions.
- May require a protein choice.
- May allow extras.
- Is not stock-tracked in version 1.

Examples:

- Jollof Rice
- Fried Rice
- Kenkey Meal
- Waakye

### 5.2 Inventory product

An inventory product:

- Has a name.
- Has an image.
- Has a selling price.
- Has a stock quantity.
- Has a low-stock level.
- Is reduced when a sale is completed.

Examples:

- Pineapple Juice
- Sobolo
- Bottled Water
- Soft Drink

## 6. Meal Configuration Rules

### 6.1 Portion

A portion defines:

- Portion name.
- Base price.
- Included description.
- Allowed protein choices.
- Allowed extras.

Example:

```text
Regular Jollof Portion
Base price: GH₵42.00
Includes: 3 rice scoops
Protein: 1 fish cut or 1 chicken leg
```

### 6.2 Protein

A protein option may be:

- Included at no extra charge.
- Available at an extra charge.
- Required.
- Optional.
- Limited to certain portions.

The system must prevent adding a configured meal when a required protein has not been selected.

### 6.3 Extras

An extra defines:

- Name.
- Unit price.
- Maximum quantity.
- Whether it is active.

Examples:

- Extra Rice Scoop
- Extra Fish Cut
- Extra Chicken Leg
- Fried Egg
- Extra Salad
- Extra Pepper

### 6.4 Price calculation

For one configured meal:

```text
meal unit total = base portion price + sum(extra price × extra quantity)
```

For multiple quantities:

```text
line total = meal unit total × meal quantity
```

Example:

```text
Base portion                 GH₵42.00
Extra rice: 2 × GH₵5.00      GH₵10.00
Extra chicken: 1 × GH₵15.00  GH₵15.00
Fried egg: 1 × GH₵5.00       GH₵5.00
Unit total                   GH₵72.00
Quantity                     2
Line total                   GH₵144.00
```

## 7. Cart Requirements

The cart must:

- Show product name.
- Show selected portion.
- Show selected protein.
- Show selected extras.
- Show item quantity.
- Show unit total.
- Show line total.
- Allow quantity increase.
- Allow quantity decrease.
- Allow item removal.
- Show subtotal.
- Show total.

Configured meals with different options must remain separate cart lines.

Example:

- Jollof Regular with Fish.
- Jollof Regular with Chicken and Extra Egg.

These are different cart items.

## 8. Checkout Requirements

Version 1 supports two payment methods: cash and mobile money (MoMo).

The checkout must:

1. Prevent checkout when the cart is empty.
2. Display the total.
3. Accept amount paid.
4. Validate that amount paid is numeric.
5. Prevent negative values.
6. Prevent completion if amount paid is lower than the total.
7. Calculate change.
8. Save the sale.
9. Reduce inventory stock.
10. Clear the cart after successful completion.
11. Display the receipt.
12. Prevent duplicate completion.

Change formula (cash only):

```text
change = amount paid - sale total
```

### Mobile money (MoMo)

For MoMo the amount paid equals the sale total, so there is no change to
calculate and no cash amount is required. An optional MoMo transaction/reference
may be recorded. Every completed sale stores its payment method (`cash` or
`momo`); the MoMo reference is stored only for MoMo sales. Version 1 has no real
MoMo API integration — the reference is entered manually.

## 9. Inventory Requirements

Inventory tracking applies only to inventory products.

The system must:

- Show current stock.
- Reduce stock after successful sale.
- Reject or warn about insufficient stock based on team decision.
- Show low-stock status.
- Never reduce prepared-meal stock.
- Never reduce stock before checkout succeeds.
- Prevent stock quantity from becoming invalid.

Recommended version 1 rule:

> Do not allow an inventory item to be sold above the available stock quantity.

## 10. Receipt Requirements

A receipt must include:

- Business logo when configured.
- Business name.
- Telephone number and address when configured.
- Receipt number.
- Date and time.
- Cashier name if available.
- Item descriptions.
- Portions.
- Proteins.
- Extras.
- Quantities.
- Line totals.
- Sale total.
- Amount paid.
- Change.
- Payment method.
- Configurable extra information and footer note when configured.

Receipts must be printable through the browser print dialog and formatted for common 58 mm and 80 mm thermal paper widths.

The receipt must use the values saved in the completed sale snapshot.

## 11. Sales History Requirements

Sales history must:

- List completed sales.
- Show receipt number.
- Show date and time.
- Show total.
- Allow a sale to be opened.
- Display the original receipt details.

Deleting completed sales is outside version 1.

## 12. Daily Report Requirements

The daily report should show:

- Number of completed sales.
- Total sales amount.
- Total cash received.
- Best-selling item if practical.
- Number of units sold by product if practical.
- Low-stock products.

Advanced financial reports are outside version 1.

## 13. Screen Requirements

Version 1 should contain:

1. Login or cashier-name screen.
2. Sales screen.
3. Meal configuration modal or panel.
4. Cart.
5. Checkout screen or modal.
6. Receipt screen.
7. Sales history screen.
8. Daily summary screen.
9. Basic inventory screen if time permits.
10. Admin user-management screen.
11. Admin settings screen.

## 14. Functional Requirements

### FR-001

The system shall display active menu items as large image tiles.

### FR-002

The system shall allow menu filtering by category.

### FR-003

The system shall open a configuration interface for configured meals.

### FR-004

The system shall require a portion selection.

### FR-005

The system shall require a protein where the selected portion requires one.

### FR-006

The system shall allow extras with quantities.

### FR-007

The system shall calculate configured meal prices in real time.

### FR-008

The system shall add configured meals to the cart.

### FR-009

The system shall add inventory products to the cart.

### FR-010

The system shall calculate cart totals.

### FR-011

The system shall process cash payments.

### FR-012

The system shall calculate change.

### FR-013

The system shall save completed sales.

### FR-014

The system shall reduce stock for inventory products.

### FR-015

The system shall display receipts.

### FR-016

The system shall display sales history.

### FR-017

The system shall display a daily summary.

## 15. Non-Functional Requirements

### Usability

- Controls must be easy to understand.
- Tiles must be touch-friendly.
- Prices must be visible.
- The number of steps per sale should be small.

### Performance

- The application should load quickly.
- It should avoid unnecessary large libraries.
- Images should be compressed.

### Reliability

- Totals must be accurate.
- Stock must not be reduced twice.
- Old receipts must not change after price updates.

### Maintainability

- Shared logic must be reused.
- Functions must have clear names.
- Files must have clear responsibilities.
- Business logic must not be hidden inside HTML event handlers.

### Compatibility

- Support current desktop browsers.
- Provide a usable mobile layout.

## 16. Out of Scope

The following are outside version 1:

- Online payment.
- Mobile money integration.
- Cloud database.
- Multi-branch operation.
- Delivery management.
- Full accounting.
- Supplier management.
- Ingredient-level kitchen inventory.
- Customer loyalty.
- Tax authority integration.
- Advanced user permissions.

## 17. Acceptance Criteria for First Milestone

The first milestone is accepted when:

- At least three food tiles are visible.
- Jollof can be configured.
- A portion can be selected.
- A protein can be selected.
- Extras can be added.
- Extra quantities work.
- The meal total is correct.
- At least one juice is stock-tracked.
- Juice stock reduces after sale.
- The cart total is correct.
- Cash checkout works.
- Change is correct.
- A receipt is saved.
- The layout works on desktop and mobile.
