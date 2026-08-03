# Gold Coast Kenkey POS Development Rules

This file defines the rules that all developers and AI coding assistants must follow.

## 1. Required Reading

Before changing code, read:

- `README.md`
- `docs/PROJECT-SPECIFICATION.md`
- `docs/DATABASE-DESIGN.md`
- `docs/UI-GUIDELINES.md`
- `docs/GIT-WORKFLOW.md`
- `docs/TESTING-CHECKLIST.md`

These files are authoritative.

If a proposed change conflicts with the documented architecture or business rules, do not implement it silently. Update the documentation first after team agreement.

## 2. Project Scope

The project is a lightweight Point of Sale system for Gold Coast Kenkey.

Version 1 includes:

- Large food tiles with pictures.
- Configurable meal portions.
- Included protein selection where applicable.
- Optional extras and extra quantities.
- Cart management.
- Cash checkout.
- Change calculation.
- Receipt generation.
- Sales history.
- Inventory tracking for drinks and packaged products.
- Low-stock warnings.
- Basic daily sales reports.

Version 1 excludes:

- Cloud synchronization.
- Online payment.
- Supplier management.
- Full accounting.
- Multiple branches.
- Delivery.
- Customer accounts.
- Advanced kitchen ingredient stock.
- Complex user permissions.

Do not add excluded features unless the team updates the specification.

## 3. Core Business Rules

1. Prepared meals are configured menu items.
2. Prepared meal ingredients are not inventory-tracked in version 1.
3. Drinks and packaged products are inventory-tracked.
4. A configured meal total is:

```text
(base portion price + total extras) × item quantity
```

5. Extras may support quantities.
6. Included proteins must not be charged unless the selected option explicitly has an extra price.
7. Historical sales must keep the names and prices used at the time of sale.
8. A later price change must not modify an old receipt.
9. Prices must not be hard-coded inside UI components.
10. Stock must only be reduced after a sale is successfully completed.
11. Failed or cancelled checkout must not reduce stock.
12. A sale must not be completed with an empty cart.
13. Cash amount paid must not be lower than the total.
14. Quantities must be positive whole numbers.
15. Money calculations must be rounded consistently to two decimal places.

## 4. Architecture Rules

1. Separate user interface code from business logic.
2. Separate business logic from storage code.
3. Reuse shared components and functions.
4. Do not duplicate pricing calculations.
5. Do not duplicate stock-reduction logic.
6. Do not duplicate receipt-number generation.
7. Do not modify unrelated files.
8. Do not introduce a second state-management or storage approach.
9. Do not add dependencies without a clear need.
10. Keep the application lightweight.

Recommended shared utilities include:

```text
calculateConfiguredMealTotal()
calculateCartSubtotal()
calculateSaleTotal()
calculateChange()
validateCheckout()
reduceInventoryStock()
generateReceiptNumber()
saveSale()
getDailySalesSummary()
```

## 5. Naming Rules

Use consistent terms throughout the project.

Approved terms:

- `portion`
- `protein`
- `extra`
- `menuItem`
- `inventoryItem`
- `cartItem`
- `sale`
- `receipt`
- `stockQuantity`
- `amountPaid`
- `changeDue`

Do not mix terms such as `addon`, `supplement`, and `modifier` for the same concept. Use `extra`.

### JavaScript naming

- Variables and functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes and components: `PascalCase`
- Files: use one agreed style consistently

Examples:

```javascript
calculateMealTotal()
selectedPortion
stockQuantity
MAX_EXTRA_QUANTITY
ProductTile
MealConfigurator
```

## 6. UI Rules

1. Use large, touch-friendly tiles.
2. Use the approved colours and typography.
3. Use shared buttons, cards, modals, and form controls.
4. Show food pictures clearly.
5. Keep important prices visible.
6. Show a live total while configuring a meal.
7. Display selected portion, protein, and extras in the cart.
8. Make the layout responsive.
9. Avoid unnecessary animations.
10. Avoid dense screens and small controls.

## 7. Validation Rules

Validate:

- Required fields.
- Numeric fields.
- Prices.
- Quantities.
- Stock availability.
- Cash amount paid.
- Empty cart.
- Missing portion selection.
- Missing required protein selection.
- Duplicate submission.
- Corrupt stored data.

Never trust user input.

## 8. Storage Rules

1. Use one storage service.
2. Do not call LocalStorage directly from many UI files.
3. Store versioned data where practical.
4. Save a complete sale snapshot.
5. Keep sales history separate from current product data.
6. Handle missing or invalid stored data safely.
7. Do not erase unrelated stored information.
8. Provide seed data for first launch.

## 9. Git Rules

1. Never work directly on `main`.
2. Create branches from `develop`.
3. Keep each branch focused on one feature.
4. Pull the latest `develop` before starting.
5. Commit small, logical changes.
6. Use meaningful commit messages.
7. Do not merge your own pull request unless the team explicitly agrees.
8. Resolve all review comments before merging.
9. Do not overwrite another member's work blindly.
10. Do not commit secrets, environment files, build output, or editor files.

## 10. Testing Rules

Before declaring a task complete:

1. Test the main workflow.
2. Test invalid input.
3. Test boundary cases.
4. Test mobile and desktop layouts.
5. Check the browser console.
6. Confirm existing workflows still work.
7. Update the testing checklist.
8. Add or update automated tests where available.

## 11. AI Coding Instructions

When using an AI coding assistant:

1. Give it only one focused task.
2. Tell it to read this file and the documentation.
3. Require it to inspect existing code before editing.
4. Require it to list files changed.
5. Require it to explain the implementation.
6. Require it to state how it tested the change.
7. Reject unnecessary rewrites.
8. Reject unrelated formatting changes.
9. Reject duplicate business logic.
10. Never accept code that the group cannot explain.

## 12. Definition of Done

A feature is complete only when:

- It matches the specification.
- It follows the UI guidelines.
- It uses the shared data model.
- It has been tested.
- It has no known critical error.
- It has no browser console error.
- It has no unnecessary dependency.
- It has been reviewed through a pull request.
- The responsible member can explain the code.
