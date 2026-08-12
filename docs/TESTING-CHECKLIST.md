# Gold Coast Kenkey POS Testing Checklist

## 1. Purpose

Use this checklist before merging a feature and before presenting the final project.

Mark each item:

```text
[ ] Not tested
[x] Passed
[!] Failed or needs attention
```

## 2. Application Startup

- [ ] The application starts without an error.
- [ ] Seed data loads on first launch.
- [ ] Existing saved data loads correctly.
- [ ] The browser console has no critical error.
- [ ] Refreshing the page does not corrupt data.
- [ ] Missing images use a fallback.

## 3. Product Display

- [ ] Active food items appear.
- [ ] Inactive items do not appear.
- [ ] Product names are readable.
- [ ] Product prices are visible.
- [ ] Food images are not distorted.
- [ ] Categories filter correctly.
- [ ] Inventory products show correct prices.
- [ ] Low-stock products show a warning.

## 4. Meal Configuration

Test each configured meal.

- [ ] Clicking a configured meal opens the configurator.
- [ ] Available portions are displayed.
- [ ] A portion can be selected.
- [ ] Portion price updates the total.
- [ ] Required protein choices are displayed.
- [ ] A required protein must be selected.
- [ ] Included protein adds no charge.
- [ ] Charged protein adds the correct amount.
- [ ] Allowed extras are displayed.
- [ ] Extra quantity can increase.
- [ ] Extra quantity can decrease.
- [ ] Extra quantity cannot become negative.
- [ ] Extra quantity cannot exceed its maximum.
- [ ] Removing an extra updates the total.
- [ ] The live total is correct.
- [ ] Cancel closes without changing the cart.
- [ ] Add to Cart creates the correct cart item.

## 5. Jollof Example Tests

Use known values.

### Test A: Base portion only

```text
Regular portion: GH₵42.00
Protein: Chicken Leg included
Expected total: GH₵42.00
```

- [ ] Actual total is GH₵42.00.

### Test B: Two extra rice scoops

```text
Base: GH₵42.00
Extra rice: 2 × GH₵5.00
Expected total: GH₵52.00
```

- [ ] Actual total is GH₵52.00.

### Test C: Multiple extras

```text
Base: GH₵42.00
Extra rice: 2 × GH₵5.00
Extra chicken: 1 × GH₵15.00
Fried egg: 1 × GH₵5.00
Expected unit total: GH₵72.00
```

- [ ] Actual unit total is GH₵72.00.

### Test D: Quantity two

```text
Unit total: GH₵72.00
Quantity: 2
Expected line total: GH₵144.00
```

- [ ] Actual line total is GH₵144.00.

## 6. Cart

- [ ] Configured meals show the meal name.
- [ ] Configured meals show the portion.
- [ ] Configured meals show the protein.
- [ ] Configured meals show extras.
- [ ] Inventory items show unit price.
- [ ] Quantity increase works.
- [ ] Quantity decrease works.
- [ ] Quantity cannot become zero unless the item is removed.
- [ ] Removing an item works.
- [ ] Different configurations remain separate.
- [ ] Identical inventory products combine or remain separate according to the documented rule.
- [ ] Cart subtotal is correct.
- [ ] Cart total is correct.
- [ ] Empty-cart message is clear.
- [ ] Refresh restores the cart if cart persistence is enabled.

## 7. Inventory

- [ ] Current stock displays correctly.
- [ ] Adding an inventory product respects available stock.
- [ ] Quantity cannot exceed available stock.
- [ ] Completed sale reduces stock.
- [ ] Cancelled checkout does not reduce stock.
- [ ] Failed checkout does not reduce stock.
- [ ] Prepared meals do not reduce stock.
- [ ] Low-stock warning appears at the threshold.
- [ ] Stock cannot become negative.
- [ ] Multiple quantities reduce the correct amount.
- [ ] Inventory Report includes only products with `trackInventory === true` and excludes configured meals.
- [ ] Inventory Report product, unit, low-stock, and out-of-stock totals are correct.
- [ ] Stock equal to the low-stock threshold is Low Stock; zero stock is Out of Stock.
- [ ] All, Low Stock, and Out of Stock filters work together with product-name search.
- [ ] Inventory Report generated date displays as DD-MM-YYYY.
- [ ] Inventory Report print contains branding, filter/search context, totals, and the full filtered table.
- [ ] Inventory Report defaults to 80 mm thermal and supports 58 mm and A4.
- [ ] Inventory Report print hides navigation, controls, stock editor, and normal background.
- [ ] Cashier cannot access Inventory; Supervisor and Admin can.

## 8. Checkout

- [ ] Empty cart cannot be checked out.
- [ ] Total is displayed.
- [ ] Cash payment is available.
- [ ] Amount paid accepts numbers.
- [ ] Amount paid rejects invalid text.
- [ ] Negative amount is rejected.
- [ ] Amount below total is rejected.
- [ ] Exact payment produces zero change.
- [ ] Amount above total produces correct change.
- [ ] Complete Sale button cannot be clicked repeatedly.
- [ ] Successful sale clears the cart.
- [ ] Successful sale creates one sale record.
- [ ] Stock reduces only once.
- [ ] A clear success message appears.

## 9. Receipt

- [ ] Business name appears.
- [ ] Receipt number appears.
- [ ] Date and time appear.
- [ ] Cashier name appears if used.
- [ ] All items appear.
- [ ] Portions appear.
- [ ] Proteins appear.
- [ ] Extras and quantities appear.
- [ ] Line totals are correct.
- [ ] Sale total is correct.
- [ ] Amount paid is correct.
- [ ] Change is correct.
- [ ] Payment method appears.
- [ ] Old receipt remains correct after changing a current product price.
- [ ] Print layout is readable if printing is implemented.

## 10. Sales History

- [ ] Completed sale appears in history.
- [ ] Receipt number is visible.
- [ ] Date is visible.
- [ ] Total is visible.
- [ ] Opening a sale shows correct details.
- [ ] Refresh does not remove history.
- [ ] History uses saved sale snapshots.
- [ ] Empty history has a clear message.
- [ ] Only completed sales appear, newest first.
- [ ] Receipt search and cashier filter work.
- [ ] From and To dates filter inclusively and reject an invalid range.
- [ ] Cash and MoMo payment filters work.
- [ ] Filtered transaction count and sales total are correct.
- [ ] Pagination works without losing the active filters.
- [ ] Sales History works at mobile and desktop widths.
- [ ] Supervisor and Admin can access Sales History; Cashier cannot.

## 11. Daily Summary

- [ ] From and To default to today and display as DD-MM-YYYY.
- [ ] Calendar buttons select From and To dates while keeping DD-MM-YYYY visible.
- [ ] Same From and To produces a daily report title.
- [ ] A multi-day range includes both boundary dates.
- [ ] From later than To is rejected.
- [ ] Printed report contains branding, period, generated time, totals, and full lists.
- [ ] Reports default to 80 mm thermal printing and also support 58 mm and A4.
- [ ] Export PDF downloads an A4 PDF directly without a popup or new tab.
- [ ] Report printing excludes navigation, controls, and normal page background.
- [ ] Receipt thermal print layout remains unchanged.
- [ ] Number of sales is correct.
- [ ] Daily total is correct.
- [ ] Cash sales total includes only completed cash sales.
- [ ] MoMo sales total includes only completed MoMo sales.
- [ ] Cash and MoMo totals are correct on a mixed-payment day.
- [ ] Sales from another date are excluded.
- [ ] Incomplete and cancelled sales are excluded.
- [ ] Products and configured meals show snapshot names and quantities.
- [ ] Best-selling item is correct if implemented.
- [ ] Low-stock list is correct.
- [ ] Zero-sales day displays correctly.
- [ ] Cashier cannot access Reports.
- [ ] Supervisor and Admin can access Reports.
- [ ] Reports Close returns to POS.

## 12. Data Validation

- [ ] Missing required fields are handled.
- [ ] Invalid prices are rejected.
- [ ] Negative prices are rejected.
- [ ] Invalid quantities are rejected.
- [ ] Corrupt LocalStorage data is handled safely.
- [ ] Duplicate IDs are prevented or handled.
- [ ] Missing referenced portion is handled.
- [ ] Missing referenced extra is handled.
- [ ] Inactive products cannot be newly sold.
- [ ] Money is rounded to two decimal places.

## 13. Responsive Layout

Test at approximately:

```text
Mobile: 375px
Tablet: 768px
Desktop: 1366px
```

- [ ] Mobile layout has no horizontal scrolling.
- [ ] Mobile tiles are usable.
- [ ] Mobile cart is accessible.
- [ ] Meal configurator fits mobile height.
- [ ] Buttons remain at least 44px high.
- [ ] Tablet layout is balanced.
- [ ] Desktop cart remains visible where expected.
- [ ] Text is not cut off.
- [ ] Modals do not overflow.
- [ ] Images remain clear.

## 14. Accessibility

- [ ] Inputs have labels.
- [ ] Images have alt text.
- [ ] Buttons have meaningful text.
- [ ] Keyboard focus is visible.
- [ ] Tab navigation is logical.
- [ ] Colour is not the only status indicator.
- [ ] Error messages are understandable.
- [ ] Modal can be closed.

## 15. Regression Test

Before merging any feature:

- [ ] Existing product tiles still work.
- [ ] Existing meal configuration still works.
- [ ] Existing cart logic still works.
- [ ] Existing checkout still works.
- [ ] Existing receipts still work.
- [ ] Existing inventory still works.
- [ ] Existing sales history still works.
- [ ] No new console errors appear.
- [ ] No unrelated files were changed.

## 15A. Users and Settings

- [ ] Admin can open Users and Settings.
- [ ] Cashier and supervisor are blocked from Users and Settings.
- [ ] Add cashier, supervisor, and admin users.
- [ ] Duplicate and invalid PINs are rejected.
- [ ] User PINs are masked in the list.
- [ ] Editing and deactivating a user persists.
- [ ] An inactive user cannot log in.
- [ ] The current admin cannot deactivate themselves.
- [ ] Required settings and receipt-prefix validation work.
- [ ] Business name and logo update login and header branding.
- [ ] Logo preview, replace, remove, and compression work.
- [ ] Receipt displays the saved logo and footer note.
- [ ] Receipt date uses DD/MM/YYYY format.
- [ ] Long receipt items scroll while totals and payment details remain visible.
- [ ] Seller can choose Print receipt or Done without printing.
- [ ] Print layout fits the selected 58 mm or 80 mm thermal paper width.
- [ ] Products, Inventory, Users, and Settings Close returns to POS.

## 16. Final Presentation Test

- [ ] Fresh application can be demonstrated.
- [ ] Sample menu data is available.
- [ ] Jollof configuration can be demonstrated.
- [ ] Extra quantities can be demonstrated.
- [ ] Juice stock reduction can be demonstrated.
- [ ] Cash payment and change can be demonstrated.
- [ ] Receipt can be demonstrated.
- [ ] Daily report can be demonstrated.
- [ ] Each member can explain their module.
- [ ] Each member can explain the shared pricing function.
- [ ] Each member can explain how data is stored.
- [ ] Each member can explain the Git workflow.
