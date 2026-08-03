# Gold Coast Kenkey POS UI Guidelines

## 1. Design Goal

The interface must be:

- Lightweight.
- Fast.
- Touch-friendly.
- Easy for a cashier to learn.
- Suitable for a small food menu.
- Visually consistent.
- Responsive on laptop, tablet, and mobile screens.

The design should prioritize speed and clarity over decoration.

## 2. Visual Direction

The interface should reflect a Ghanaian food business without becoming visually crowded.

Recommended style:

- Warm background.
- Dark green primary colour.
- Gold accent colour.
- Clear food photography.
- Large rounded tiles.
- Strong price visibility.
- Minimal animation.

## 3. Colour Palette

Recommended palette:

```text
Primary dark green: #14532D
Primary green:      #15803D
Gold accent:        #D4A017
Warm background:    #FFF8E7
Surface white:      #FFFFFF
Main text:          #1F2937
Secondary text:     #6B7280
Border:             #E5E7EB
Danger:             #DC2626
Warning:            #D97706
Success:            #16A34A
```

The team may adjust these colours once, but all screens must use the same palette.

Use CSS variables:

```css
:root {
  --color-primary-dark: #14532d;
  --color-primary: #15803d;
  --color-accent: #d4a017;
  --color-background: #fff8e7;
  --color-surface: #ffffff;
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-danger: #dc2626;
  --color-warning: #d97706;
  --color-success: #16a34a;
}
```

Do not hard-code different colours in individual pages.

## 4. Typography

Use one simple font stack:

```css
font-family: Arial, Helvetica, sans-serif;
```

Recommended sizes:

```text
Page title:        28–32px
Section title:     20–24px
Tile title:        16–20px
Primary price:     18–24px
Body text:         14–16px
Small helper text: 12–14px
Button text:       16–18px
```

Avoid very small text.

## 5. Layout

### Desktop

Recommended structure:

```text
----------------------------------------------------
Header
----------------------------------------------------
Categories | Product Tiles              | Cart
           |                            |
           |                            |
----------------------------------------------------
```

The cart should remain visible where screen width allows.

### Tablet

- Product grid remains primary.
- Cart may use a fixed side panel or slide-over panel.
- Controls must remain touch-friendly.

### Mobile

- Two product tiles per row where practical.
- Cart may open from a fixed bottom button.
- Meal configuration should use a full-screen modal or bottom sheet.
- Avoid horizontal scrolling.

## 6. Product Tiles

Every product tile should display:

- Product image.
- Product name.
- Starting price or fixed price.
- Stock warning for inventory products where needed.

Recommended tile rules:

- Minimum width: 140px.
- Minimum height: 170px.
- Border radius: 12–16px.
- Clear hover and focus state.
- Large clickable area.
- Image aspect ratio should be consistent.
- No tiny text-only product buttons.

Example structure:

```text
+----------------------+
|      Food Image      |
|                      |
+----------------------+
| Jollof Rice          |
| From GH₵42.00        |
+----------------------+
```

## 7. Product Images

- Use real or representative food images.
- Compress images before adding them.
- Use consistent dimensions.
- Avoid distorted images.
- Use `object-fit: cover`.
- Provide fallback images.

Recommended maximum file size:

```text
150–300 KB per image
```

## 8. Buttons

### Primary button

Use for:

- Add to Cart
- Complete Sale
- Confirm

Style:

- Green background.
- White text.
- Large height.
- Strong focus state.

### Accent button

Use for:

- Pay
- Checkout
- Important highlighted actions

Style:

- Gold background.
- Dark text.

### Danger button

Use for:

- Remove
- Cancel
- Clear Cart

Style:

- Red background or red outline.

### Secondary button

Use for:

- Back
- Close
- Optional actions

Minimum touch target:

```text
44px × 44px
```

## 9. Meal Configuration Interface

The meal configuration modal or panel must show:

1. Meal name.
2. Food image.
3. Portion choices.
4. Included description.
5. Protein choices.
6. Extras.
7. Extra quantity controls.
8. Live unit total.
9. Add to Cart button.
10. Cancel or close button.

Recommended flow:

```text
Choose Portion
Choose Protein
Choose Extras
Review Total
Add to Cart
```

The cashier should not need to open several separate pages.

## 10. Portion Controls

Use large selection cards or radio-style buttons.

Example:

```text
[ Regular Portion ]
3 scoops + 1 protein
GH₵42.00
```

The selected portion must be visually obvious.

## 11. Protein Controls

Use image buttons or large text buttons where images are unavailable.

The selected protein must be visibly highlighted.

Display extra cost where applicable:

```text
Chicken Leg
Included
```

or:

```text
Large Fish
+ GH₵5.00
```

## 12. Extras Controls

Each extra should show:

- Name.
- Unit price.
- Minus button.
- Quantity.
- Plus button.

Example:

```text
Extra Rice Scoop     GH₵5.00     [−] 2 [+]
```

Do not use a tiny numeric input as the only control.

## 13. Cart Design

Each cart item must show:

- Product name.
- Portion.
- Protein.
- Extras.
- Quantity controls.
- Line total.
- Remove action.

Example:

```text
Jollof Rice — Regular
Protein: Chicken Leg
Extras: Extra Rice × 2, Fried Egg × 1
Qty: [−] 1 [+]
GH₵57.00
```

The cart total must remain easy to see.

## 14. Checkout Design

Checkout must show:

- Sale total.
- Payment method.
- Amount paid input.
- Calculated change.
- Complete Sale button.
- Cancel button.

The amount-paid field should:

- Accept numeric input.
- Be large.
- Be easy to clear.
- Show validation errors clearly.

## 15. Receipt Design

The receipt should be clean and printable.

Use:

- Business name at top.
- Receipt number.
- Date and time.
- Item breakdown.
- Total.
- Amount paid.
- Change.
- Thank-you message.

Do not display unnecessary interface controls inside the printable area.

## 16. Feedback Messages

Use clear messages.

Good:

```text
Please select a protein.
Amount paid is less than the total.
Only 2 Pineapple Juices are available.
Sale completed successfully.
```

Avoid:

```text
Invalid operation.
Error 101.
Something went wrong.
```

## 17. Accessibility

- Use sufficient colour contrast.
- Do not rely on colour alone.
- Support keyboard focus.
- Add meaningful image alt text.
- Label inputs.
- Use semantic HTML.
- Ensure modals can be closed.
- Ensure focus moves correctly into and out of modals where practical.

## 18. Responsive Breakpoints

Suggested breakpoints:

```css
/* Mobile first */

@media (min-width: 640px) {
  /* tablet */
}

@media (min-width: 1024px) {
  /* desktop */
}
```

Avoid creating many unnecessary breakpoints.

## 19. Consistency Rules

- Use one button component or shared button class.
- Use one modal style.
- Use one card style.
- Use one money format.
- Use one spacing scale.
- Use one icon set if icons are used.
- Do not redesign a shared component inside one feature branch.

## 20. UI Review Checklist

Before merging a UI change:

- Are tiles large enough?
- Are pictures visible?
- Are prices readable?
- Are selected choices obvious?
- Does the cart show complete configuration?
- Does the layout work at mobile width?
- Does the layout work at desktop width?
- Are buttons consistent?
- Are error messages understandable?
- Are there any overlapping or cut-off elements?
