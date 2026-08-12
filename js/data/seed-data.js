/*
 * seed-data.js
 * Sample data loaded on first launch (AGENTS.md rule 8.8 / Storage rule 8).
 * Shapes follow DATABASE-DESIGN.md exactly so every feature shares one model.
 *
 * This is plain data only. The storage service decides when to write it. Menu
 * values (names and Ghana cedi prices) are taken verbatim from the Gold Coast
 * printed menu. Prices are stored as plain numbers; the currency symbol (GH₵)
 * lives in settings.
 *
 * ---------------------------------------------------------------------------
 * TODO (owner confirmation needed - nothing below was guessed):
 *  1. Jollof/Fried Rice: the menu lists each item as "JOLLOF OR FRIED RICE",
 *     i.e. the customer chooses jollof OR fried rice at the same price. The
 *     current data model has no generic option group (only a protein choice),
 *     so the rice-type choice is NOT yet represented. Confirm how to model it.
 *  2. Jollof/Fried Rice: three portions share the name "Jollof or Fried Rice"
 *     and three share "Eggis Jollof or Fried Rice" (they differ only by size /
 *     price). Names are kept verbatim; confirm distinct display labels.
 *  3. Kenkey & Chicken Stew: three portions share the name "Kenkey & Chicken
 *     Stew" (GH₵53 / 64 / 68). Kept verbatim; confirm distinct labels.
 *  4. "Freestyle Enjoyment" (build-your-own kenkey) is its own menu section.
 *     It is placed here under the "Kenkey Meal Packs" category as a configured
 *     meal. Confirm whether it should be its own category.
 *  5. "Extras" category: extras are stored in the shared `extras` array and
 *     attached to meals as paid add-ons (per the data model). The category
 *     record exists as requested but has no product tiles. Confirm whether a
 *     standalone "Extras" tile section is wanted.
 *  6. Extra `maximumQuantity` is not printed on the menu; a placeholder of 10
 *     is used for every extra. Confirm real per-extra limits.
 *  7. Drinks `stockQuantity` / `lowStockLevel` are not on the menu; placeholder
 *     sample counts are used. The owner must set real stock figures.
 *  8. "Pineapple Juice" is an existing product but is NOT on the provided menu.
 *     It is kept (not deleted) pending confirmation to keep or remove it.
 *  9. Only jollof / fried-rice / kenkey have photos; other meals use the
 *     built-in "Add photo" placeholder until real images are added.
 * 10. Menu wording "5(1/2) cups rice" is read as "5½ cups"; confirm.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  // Placeholder maximum for every paid extra (see TODO 6).
  var DEFAULT_EXTRA_MAX = 10;

  // Placeholder stock figures for drinks (see TODO 7).
  var DEFAULT_DRINK_STOCK = 20;
  var DEFAULT_DRINK_LOW = 5;

  var SEED_DATA = {
    // All branding lives in settings so the whole app (login, header, future
    // receipts/screens) can render from one reusable source. Gold Coast Kenkey
    // is only the default seed; change these values for another business.
    settings: {
      businessName: "Gold Coast Kenkey",
      shortName: "GCK",
      logo: "", // image path when available; a shortName wordmark is shown otherwise
      phone: "0245638225 / 0594908945 / 0532430146", // TODO: confirm business vs delivery numbers
      address: "", // TODO: not printed on the menu - owner to provide
      currencyCode: "GHS",
      currencySymbol: "GH₵",
      receiptPrefix: "GCK",
      receiptFooterNote: "Thank you for choosing Gold Coast Kenkey!",
      receiptExtraInfo: "",
      receiptPaperWidth: "80mm",
      dataVersion: 2
    },

    // Seeded users. PIN is simplified for a school project (DATABASE-DESIGN.md
    // section 12); do not store real production passwords this way.
    cashiers: [
      { id: "user-cashier", name: "Cashier", pin: "1111", role: "cashier", active: true },
      { id: "user-supervisor", name: "Supervisor", pin: "2222", role: "supervisor", active: true },
      { id: "user-admin", name: "Admin", pin: "3333", role: "admin", active: true }
    ],

    // Proteins are kept for compatibility and future protein-choice features.
    // No meal on the current menu offers a protein CHOICE (proteins are included
    // as part of each portion), so no meal below sets proteinRequired: true.
    proteins: [
      { id: "fish-cut", name: "Fish Cut", additionalPrice: 0, active: true },
      { id: "chicken-leg", name: "Chicken Leg", additionalPrice: 0, active: true }
    ],

    // Seven structured categories, one per requested menu section.
    categories: [
      { id: "jollof-fried-rice", name: "Jollof / Fried Rice", displayOrder: 1, active: true },
      { id: "gobe", name: "Gobe", displayOrder: 2, active: true },
      { id: "waakye", name: "Waakye", displayOrder: 3, active: true },
      { id: "kenkey-meal-packs", name: "Kenkey Meal Packs", displayOrder: 4, active: true },
      { id: "kenkey-stew", name: "Kenkey & Stew", displayOrder: 5, active: true },
      // TODO 5: extras are add-ons stored in `extras`; this category has no tiles.
      { id: "extras", name: "Extras", displayOrder: 6, active: true },
      { id: "drinks", name: "Drinks", displayOrder: 7, active: true }
    ],

    // Configured meals. Never inventory-tracked (version 1 business rule).
    menuItems: [
      {
        id: "jollof-fried-rice",
        popular: true,
        name: "Jollof / Fried Rice",
        categoryId: "jollof-fried-rice",
        itemType: "configured-meal",
        image: "images/jollof.jpg", // images/fried-rice.jpg also available (TODO 1/9)
        description: "Ghana jollof or fried rice, served in several sizes",
        active: true,
        portionIds: [
          "jfr-mini", "jfr-ecomini", "jfr-42", "jfr-eggis-50",
          "jfr-52", "jfr-eggis-58", "jfr-65", "jfr-eggis-73"
        ],
        allowedExtraIds: [
          "jfr-cup-rice", "jfr-fish", "jfr-chicken", "jfr-sardine",
          "jfr-kpakpo-shito", "jfr-black-shito", "jfr-coleslaw",
          "jfr-egg-omelette", "jfr-2egg-omelette", "jfr-plantain",
          "jfr-poly-pack", "jfr-food-bowl"
        ]
      },
      {
        id: "gobe",
        name: "Gobe (Red-Red / Plantain + Beans)",
        categoryId: "gobe",
        itemType: "configured-meal",
        image: "", // placeholder until a photo is added (TODO 9)
        description: "Red-red: plantain and beans, in several sizes",
        active: true,
        portionIds: [
          "gobe-manager", "gobe-chairman", "gobe-diploma",
          "gobe-degree", "gobe-master", "gobe-phd"
        ],
        allowedExtraIds: [
          "gobe-scoop-beans", "gobe-plantain", "gobe-fish",
          "gobe-chicken", "gobe-boiled-egg", "gobe-gari", "gobe-food-bowl"
        ]
      },
      {
        id: "waakye",
        name: "Waakye",
        categoryId: "waakye",
        itemType: "configured-meal",
        image: "", // placeholder (TODO 9)
        description: "Milady waakye settings, in several sizes",
        active: true,
        portionIds: [
          "waakye-ewuraba", "waakye-hemaa", "waakye-dishie",
          "waakye-hene", "waakye-ecomini"
        ],
        allowedExtraIds: [
          "waakye-food-bowl", "waakye-poly-pack", "waakye-scoop",
          "waakye-spaghetti", "waakye-salad", "waakye-plantain",
          "waakye-shito", "waakye-stew", "waakye-meat", "waakye-fish",
          "waakye-chicken", "waakye-gari", "waakye-wele", "waakye-egg"
        ]
      },
      {
        id: "kenkey-meal-pack",
        popular: true,
        name: "Kenkey Meal Pack",
        categoryId: "kenkey-meal-packs",
        itemType: "configured-meal",
        image: "images/kenkey.jpg",
        description: "Kenkey meal packs with fish, pepper and veg",
        active: true,
        portionIds: [
          "kpack-ankonam", "kpack-ankonam-plus", "kpack-didibom",
          "kpack-didibom-plus", "kpack-party-box", "kpack-party-box-plus",
          "kpack-house-party", "kpack-house-party-plus", "kpack-fiesta",
          "kpack-fiesta-plus"
        ],
        allowedExtraIds: [
          "kpack-ball-kenkey", "kpack-fish", "kpack-chicken",
          "kpack-fried-egg", "kpack-2fried-eggs", "kpack-sardine",
          "kpack-shrimp", "kpack-food-pack", "kpack-one-man-thousand",
          "kpack-kpakpo-shito", "kpack-black-shito", "kpack-veg",
          "kpack-plastic-pack"
        ]
      },
      {
        // "Freestyle Enjoyment": choose kenkey balls, then paid accompaniments.
        // TODO 4: confirm whether this should be its own category.
        id: "freestyle-kenkey",
        name: "Freestyle Kenkey",
        categoryId: "kenkey-meal-packs",
        itemType: "configured-meal",
        image: "", // placeholder (TODO 9)
        description: "Build your own: choose kenkey and accompaniments",
        active: true,
        portionIds: ["freestyle-1ball", "freestyle-2balls"],
        // Accompaniments reuse the shared Kenkey add-on extras.
        allowedExtraIds: [
          "kpack-fish", "kpack-chicken", "kpack-fried-egg",
          "kpack-2fried-eggs", "kpack-shrimp", "kpack-one-man-thousand",
          "kpack-sardine", "kpack-kpakpo-shito", "kpack-black-shito",
          "kpack-veg"
        ]
      },
      {
        id: "kenkey-chicken-stew",
        name: "Kenkey & Chicken Stew",
        categoryId: "kenkey-stew",
        itemType: "configured-meal",
        image: "", // placeholder (TODO 9)
        description: "Kenkey with chicken stew",
        active: true,
        portionIds: ["kcs-53", "kcs-68", "kcs-only-43", "kcs-64"],
        allowedExtraIds: [
          "kcs-scoop-stew", "kcs-kenkey", "kcs-big-chicken", "kcs-chicken",
          "kcs-fish", "kcs-boiled-egg", "kcs-2boiled-eggs", "kcs-fried-egg",
          "kcs-2fried-eggs", "kcs-plastic-pack"
        ]
      },
      {
        id: "kenkey-okro-stew",
        name: "Kenkey & Okro Stew",
        categoryId: "kenkey-stew",
        itemType: "configured-meal",
        image: "", // placeholder (TODO 9)
        description: "Kenkey with okro stew (meat, wele, tuna & salmon)",
        active: true,
        portionIds: ["kos-53", "kos-only-43"],
        allowedExtraIds: [
          "kos-scoop-okro", "kos-kenkey", "kos-wele-tuna",
          "kos-fish-cutlet", "kos-beef", "kos-plastic-pack"
        ]
      }
    ],

    // Portions carry the base price and the INCLUDED items (kept separate from
    // paid extras, which live in the `extras` array). proteinRequired is false
    // for every portion because these meals include their proteins.
    portions: [
      // --- Jollof / Fried Rice (TODO 1, 2) ---------------------------------
      { id: "jfr-mini", menuItemId: "jollof-fried-rice", name: "Mini Jollof or Fried Rice", price: 27, includedDescription: "3 cups rice, 1 chicken, 1 shito, 1 coleslaw", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-ecomini", menuItemId: "jollof-fried-rice", name: "Ecomini Jollof or Fried Rice", price: 31, includedDescription: "4 cups rice, 1 chicken, 1 shito, 1 coleslaw", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-42", menuItemId: "jollof-fried-rice", name: "Jollof or Fried Rice", price: 42, includedDescription: "3 cups rice, 2 chicken, 1 shito, 1 coleslaw", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-eggis-50", menuItemId: "jollof-fried-rice", name: "Eggis Jollof or Fried Rice", price: 50, includedDescription: "3 cups rice, 2 chicken, 1 shito, 1 coleslaw, 2 eggs omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-52", menuItemId: "jollof-fried-rice", name: "Jollof or Fried Rice", price: 52, includedDescription: "5½ cups rice, 2 chicken, 2 shito, 1 coleslaw", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-eggis-58", menuItemId: "jollof-fried-rice", name: "Eggis Jollof or Fried Rice", price: 58, includedDescription: "5 cups rice, 2 chicken, 2 shito, 1 coleslaw, 2 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-65", menuItemId: "jollof-fried-rice", name: "Jollof or Fried Rice", price: 65, includedDescription: "5 cups rice, 3 chicken, 2 shito, 1 coleslaw", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "jfr-eggis-73", menuItemId: "jollof-fried-rice", name: "Eggis Jollof or Fried Rice", price: 73, includedDescription: "5 cups rice, 3 chicken, 2 shito, 1 coleslaw, 2 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Gobe (Red-Red) --------------------------------------------------
      { id: "gobe-manager", menuItemId: "gobe", name: "Gobe Manager", price: 37, includedDescription: "Plantain and beans, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "gobe-chairman", menuItemId: "gobe", name: "Gobe Chairman", price: 41, includedDescription: "Plantain & beans with 1 boiled egg, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "gobe-diploma", menuItemId: "gobe", name: "Gobe Diploma", price: 52, includedDescription: "Plantain & beans with 1 fish, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "gobe-degree", menuItemId: "gobe", name: "Gobe Degree", price: 56, includedDescription: "Plantain & beans with 1 fish, 1 boiled egg, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "gobe-master", menuItemId: "gobe", name: "Gobe Master", price: 67, includedDescription: "Plantain & beans with 2 fish, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "gobe-phd", menuItemId: "gobe", name: "Gobe PHD", price: 71, includedDescription: "Plantain & beans with 1 boiled egg, 2 fish, food bowl", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Waakye ----------------------------------------------------------
      { id: "waakye-ewuraba", menuItemId: "waakye", name: "Waakye Ewuraba", price: 37, includedDescription: "Waakye, shito, stew, meat, gari & spaghetti", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "waakye-hemaa", menuItemId: "waakye", name: "Waakye Hemaa", price: 44, includedDescription: "Waakye, shito, stew, meat, gari, spaghetti, wele & egg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "waakye-dishie", menuItemId: "waakye", name: "Waakye Dishie", price: 47, includedDescription: "Waakye, shito, stew, meat, gari, spaghetti, wele, egg & plantain", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "waakye-hene", menuItemId: "waakye", name: "Waakye Hene", price: 71, includedDescription: "Waakye, shito, stew, meat, fish, gari, spaghetti, plantain, salad, wele & egg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "waakye-ecomini", menuItemId: "waakye", name: "Waakye Ecomini", price: 26, includedDescription: "Waakye, shito, stew, egg, gari & spaghetti", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Kenkey Meal Packs ----------------------------------------------
      { id: "kpack-ankonam", menuItemId: "kenkey-meal-pack", name: "Ankonam", price: 40, includedDescription: "2 kenkey, 2 fish, 2 pepper, 1 pack veg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-ankonam-plus", menuItemId: "kenkey-meal-pack", name: "Ankonam+", price: 48, includedDescription: "2 kenkey, 2 fish, 2 pepper, 1 pack veg, 2 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-didibom", menuItemId: "kenkey-meal-pack", name: "Didibom", price: 60, includedDescription: "3 kenkey, 3 fish, 3 pepper, 1 pack veg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-didibom-plus", menuItemId: "kenkey-meal-pack", name: "Didibom+", price: 68, includedDescription: "3 kenkey, 3 fish, 3 pepper, 1 pack veg, 2 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-party-box", menuItemId: "kenkey-meal-pack", name: "Party Box", price: 80, includedDescription: "4 kenkey, 4 fish, 4 pepper, 2 pack veg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-party-box-plus", menuItemId: "kenkey-meal-pack", name: "Party Box+", price: 88, includedDescription: "4 kenkey, 4 fish, 4 pepper, 2 pack veg, 2 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-house-party", menuItemId: "kenkey-meal-pack", name: "House Party", price: 100, includedDescription: "5 kenkey, 5 fish, 5 pepper, 2 pack veg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-house-party-plus", menuItemId: "kenkey-meal-pack", name: "House Party+", price: 112, includedDescription: "5 kenkey, 5 fish, 5 pepper, 2 pack veg, 3 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-fiesta", menuItemId: "kenkey-meal-pack", name: "Kenkey Fiesta", price: 120, includedDescription: "6 kenkey, 6 fish, 6 pepper, 3 pack veg", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kpack-fiesta-plus", menuItemId: "kenkey-meal-pack", name: "Kenkey Fiesta +", price: 136, includedDescription: "6 kenkey, 6 fish, 6 pepper, 3 pack veg, 4 egg omelette", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Freestyle Kenkey (choose your kenkey) ---------------------------
      { id: "freestyle-1ball", menuItemId: "freestyle-kenkey", name: "1 Ball of Kenkey", price: 5, includedDescription: "1 ball of kenkey", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "freestyle-2balls", menuItemId: "freestyle-kenkey", name: "2 Balls of Kenkey", price: 10, includedDescription: "2 balls of kenkey", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Kenkey & Chicken Stew (TODO 3) ----------------------------------
      { id: "kcs-53", menuItemId: "kenkey-chicken-stew", name: "Kenkey & Chicken Stew", price: 53, includedDescription: "2 kenkey + chicken stew (1 chicken, 1 boiled egg), 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kcs-68", menuItemId: "kenkey-chicken-stew", name: "Kenkey & Chicken Stew", price: 68, includedDescription: "2 kenkey + chicken stew, 2 chicken, 1 boiled egg, 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kcs-only-43", menuItemId: "kenkey-chicken-stew", name: "Chicken Stew Only", price: 43, includedDescription: "Chicken stew + 1 chicken, 1 boiled egg, 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kcs-64", menuItemId: "kenkey-chicken-stew", name: "Kenkey & Chicken Stew", price: 64, includedDescription: "2 kenkey + chicken stew, 2 chicken, 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true },

      // --- Kenkey & Okro Stew ---------------------------------------------
      { id: "kos-53", menuItemId: "kenkey-okro-stew", name: "Kenkey & Okro Stew", price: 53, includedDescription: "2 balls kenkey + okro stew (with meat, wele, tuna & salmon), 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true },
      { id: "kos-only-43", menuItemId: "kenkey-okro-stew", name: "Okro Stew Only", price: 43, includedDescription: "Okro stew only (with meat, wele, tuna & salmon), 1 stew bowl", proteinRequired: false, allowedProteinIds: [], active: true }
    ],

    // Paid extras (add-ons). Kept separate from included items above. IDs are
    // section-scoped because some names repeat across sections at different
    // prices (e.g. shito is GH₵4 for jollof but GH₵3 for kenkey).
    // maximumQuantity is a placeholder (TODO 6).
    extras: [
      // Jollof / Fried Rice
      { id: "jfr-cup-rice", name: "1 cup rice", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-fish", name: "1 fish", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-chicken", name: "1 chicken", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-sardine", name: "1 sardine", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-kpakpo-shito", name: "1 kpakpo shito", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-black-shito", name: "1 black shito", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-coleslaw", name: "1 coleslaw", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-egg-omelette", name: "1 egg omelette", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-2egg-omelette", name: "2 egg omelette", price: 8, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-plantain", name: "1 portion plantain", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-poly-pack", name: "1 poly food pack", price: 2, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "jfr-food-bowl", name: "1 food bowl", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },

      // Gobe
      { id: "gobe-scoop-beans", name: "1 scoop beans", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-plantain", name: "1 plantain", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-fish", name: "1 fish", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-chicken", name: "1 chicken", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-boiled-egg", name: "1 boiled egg", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-gari", name: "1 portion gari", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "gobe-food-bowl", name: "1 food bowl", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },

      // Waakye
      { id: "waakye-food-bowl", name: "1 food bowl", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-poly-pack", name: "1 poly pack", price: 2, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-scoop", name: "1 scoop waakye", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-spaghetti", name: "1 portion spaghetti", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-salad", name: "1 portion salad", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-plantain", name: "1 portion plantain", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-shito", name: "1 shito", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-stew", name: "1 stew", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-meat", name: "1 meat", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-fish", name: "1 fish", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-chicken", name: "1 chicken", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-gari", name: "1 gari", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-wele", name: "1 wele", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "waakye-egg", name: "1 egg", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },

      // Kenkey Meal Packs (also used as Freestyle accompaniments)
      { id: "kpack-ball-kenkey", name: "1 ball kenkey", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-fish", name: "1 fish", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-chicken", name: "1 chicken", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-fried-egg", name: "1 fried egg", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-2fried-eggs", name: "2 fried eggs", price: 8, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-sardine", name: "1 sardine", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-shrimp", name: "1 shrimp", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-food-pack", name: "1 food pack", price: 2, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-one-man-thousand", name: "1 one man thousand", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-kpakpo-shito", name: "1 kpakpo shito sauce", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-black-shito", name: "1 black shito", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-veg", name: "1 portion veg (onions & tomatoes)", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kpack-plastic-pack", name: "1 plastic pack", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },

      // Kenkey & Chicken Stew
      { id: "kcs-scoop-stew", name: "1 scoop stew", price: 8, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-kenkey", name: "1 kenkey", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-big-chicken", name: "1 big chicken", price: 20, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-chicken", name: "1 chicken", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-fish", name: "1 fish", price: 15, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-boiled-egg", name: "1 boiled egg", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-2boiled-eggs", name: "2 boiled eggs", price: 8, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-fried-egg", name: "1 fried egg", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-2fried-eggs", name: "2 fried eggs", price: 8, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kcs-plastic-pack", name: "1 plastic pack", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },

      // Kenkey & Okro Stew
      { id: "kos-scoop-okro", name: "1 scoop okro", price: 6, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kos-kenkey", name: "1 kenkey", price: 5, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kos-wele-tuna", name: "1 wele or tuna", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kos-fish-cutlet", name: "1 fish cutlet", price: 3, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kos-beef", name: "1 beef", price: 12, maximumQuantity: DEFAULT_EXTRA_MAX, active: true },
      { id: "kos-plastic-pack", name: "1 plastic pack", price: 4, maximumQuantity: DEFAULT_EXTRA_MAX, active: true }
    ],

    // Drinks are inventory products (stock-tracked). Stock figures are
    // placeholders (TODO 7). "Pineapple Juice" is kept from the original seed
    // even though it is not on the provided menu (TODO 8).
    inventoryProducts: [
      { id: "coca-cola", name: "Coca Cola", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 10, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true, popular: true },
      { id: "sprite", name: "Sprite", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 10, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "fanta", name: "Fanta", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 10, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "malt", name: "Malt", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 12, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "bissap", name: "Bissap", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "bottle-water", name: "Bottle Water", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 3, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "can-malt", name: "Can Malt", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "can-cocktail", name: "Can Cocktail", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "can-fanta", name: "Can Fanta", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "can-coke", name: "Can Coke", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      { id: "can-sprite", name: "Can Sprite", categoryId: "drinks", itemType: "inventory-product", image: "", sellingPrice: 20, stockQuantity: DEFAULT_DRINK_STOCK, lowStockLevel: DEFAULT_DRINK_LOW, active: true },
      // Existing product, not on the provided menu (TODO 8).
      { id: "pineapple-juice", name: "Pineapple Juice", categoryId: "drinks", itemType: "inventory-product", image: "images/pineapple-juice.jpg", sellingPrice: 12, stockQuantity: 30, lowStockLevel: 5, active: true }
    ]
  };

  // ---- Product type / inventory contract ---------------------------------
  // Every product carries an explicit product type and an inventory contract so
  // stock behaviour depends on `trackInventory` alone - never on category or
  // product name. Applied here so the whole catalogue stays consistent and any
  // product added to the arrays above inherits the correct, reusable contract.
  //   - Configured meals: productType "configured-meal", never stock-tracked.
  //   - Simple products (currently drinks): productType "simple", stock-tracked.
  // The older `itemType` field is left in place for storage compatibility.
  SEED_DATA.menuItems.forEach(function (meal) {
    meal.productType = "configured-meal";
    meal.trackInventory = false;
    meal.stockQuantity = null;
    meal.lowStockLevel = null;
  });
  SEED_DATA.inventoryProducts.forEach(function (product) {
    product.productType = "simple";
    product.trackInventory = true;
    // stockQuantity and lowStockLevel are already defined per product above.
  });

  global.GCK = global.GCK || {};
  global.GCK.seedData = SEED_DATA;
})(window);
