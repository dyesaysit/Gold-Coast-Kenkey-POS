
# Gold Coast Kenkey POS

A lightweight, touch-friendly Point of Sale system for Gold Coast Kenkey, a food joint in Ghana.

This project is being developed as a group assignment for an Introduction to Programming course. The system is designed for a small menu, large food tiles with pictures, configurable meal portions, optional extras, inventory-tracked drinks, checkout, receipts, and basic sales reporting.

## Project Goal

The goal is to build a simple POS that allows a cashier to:

- Select food using large picture tiles.
- Choose a meal portion.
- Select the included protein where applicable.
- Add extra scoops of rice, fish, chicken, eggs, or other extras.
- Add bottled drinks and juices to the cart.
- Calculate the final total correctly.
- Complete a cash sale.
- Calculate customer change.
- Save and display receipts.
- Track stock for drinks and packaged products.
- View a basic daily sales summary.

## Important Business Rule

Prepared meals and drinks are handled differently.

### Prepared meals

Prepared meals are configured menu items. They are sold by portion and may include selectable proteins and extras.

Example:

```text
Jollof Regular Portion      GH₵42.00
Extra Rice Scoop × 2        GH₵10.00
Extra Chicken Leg           GH₵15.00
Fried Egg                   GH₵5.00
------------------------------------
Total                       GH₵72.00
```

Prepared food ingredients are not inventory-tracked in version 1.

### Inventory products

Drinks, bottled water, packaged juice, and other packaged products are inventory-tracked.

When an inventory product is sold, its stock quantity must be reduced.

## Recommended Technology

The team should use one agreed technology stack.

Recommended beginner-friendly option:

- HTML5
- CSS3
- JavaScript
- LocalStorage or IndexedDB
- Git and GitHub

A React and TypeScript implementation may be used only if every group member can understand and explain the code.

## Repository Structure

```text
gold-coast-kenkey-pos/
│
├── .github/
│   ├── CODEOWNERS
│   └── pull_request_template.md
│
├── docs/
│   ├── PROJECT-SPECIFICATION.md
│   ├── DATABASE-DESIGN.md
│   ├── UI-GUIDELINES.md
│   ├── GIT-WORKFLOW.md
│   └── TESTING-CHECKLIST.md
│
├── public/
│   └── images/
│
├── src/
│   ├── components/
│   ├── data/
│   ├── pages/
│   ├── services/
│   ├── styles/
│   ├── types/
│   └── utils/
│
├── tests/
├── AGENTS.md
├── README.md
└── package.json
```

The exact source-code folders may change depending on whether the team uses plain JavaScript or React. The documentation and business rules remain authoritative.

## Documentation

Before making code changes, every team member and every AI coding assistant must read:

1. `AGENTS.md`
2. `docs/PROJECT-SPECIFICATION.md`
3. `docs/DATABASE-DESIGN.md`
4. `docs/UI-GUIDELINES.md`
5. `docs/GIT-WORKFLOW.md`
6. `docs/TESTING-CHECKLIST.md`

If code conflicts with the documentation, the documentation wins unless the team first agrees to update it.

## Development Workflow

The repository uses:

- `main` for stable releases.
- `develop` for integrated development.
- Feature branches for individual work.

Example:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/meal-configuration
```

All work must be submitted through a pull request into `develop`.

Do not push directly to `main`.

## Suggested Team Responsibilities

### Member 1: Sales interface

- Product tiles
- Categories
- Portion selection
- Protein selection
- Extras
- Cart

### Member 2: Checkout and receipts

- Payment
- Amount paid
- Change
- Receipt
- Sales history

### Member 3: Inventory and reports

- Drinks inventory
- Stock reduction
- Low-stock warnings
- Product management
- Daily summary

All members should review and understand the shared pricing and storage logic.

## First Milestone

The first working milestone should contain:

- Three sample food tiles.
- One configurable Jollof meal.
- One inventory-tracked juice.
- A cart.
- Correct total calculation.
- Cash payment.
- Correct change calculation.
- A saved receipt.

## Academic Requirement

Every member must be able to explain:

- Variables
- Arrays
- Objects
- Functions
- Conditions
- Loops
- Events
- Calculations
- Input validation
- Local storage
- Modular programming
- Git branches
- Pull requests

Do not merge code that the group cannot explain during the presentation.

## License

This repository is for a school project. The team should decide later whether to add an open-source license.

