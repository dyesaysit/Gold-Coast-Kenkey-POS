/*
 * seed-data.js
 * Sample data loaded on first launch (AGENTS.md rule 8.8 / Storage rule 8).
 * Shapes follow DATABASE-DESIGN.md exactly so every feature shares one model.
 *
 * This is plain data only. The storage service decides when to write it.
 * Image paths are referenced here even though the image files may not exist yet;
 * the UI shows a graceful placeholder when an image fails to load.
 */
(function (global) {
  "use strict";

  var SEED_DATA = {
    settings: {
      businessName: "Gold Coast Kenkey",
      currencyCode: "GHS",
      currencySymbol: "GH₵",
      receiptPrefix: "GCK",
      dataVersion: 1
    },

    cashiers: [
      { id: "cashier-1", name: "Cashier", pin: "0000", active: true }
    ],

    categories: [
      { id: "rice-meals", name: "Rice Meals", displayOrder: 1, active: true },
      { id: "kenkey-meals", name: "Kenkey Meals", displayOrder: 2, active: true },
      { id: "drinks", name: "Drinks", displayOrder: 3, active: true }
    ],

    // Configured meals. Not stock-tracked in version 1.
    menuItems: [
      {
        id: "jollof",
        name: "Jollof Rice",
        categoryId: "rice-meals",
        itemType: "configured-meal",
        image: "images/jollof.jpg",
        description: "Jollof rice served with a selected protein",
        active: true,
        portionIds: ["jollof-regular", "jollof-large"],
        allowedExtraIds: ["extra-rice", "extra-fish", "extra-chicken", "fried-egg"]
      },
      {
        id: "fried-rice",
        name: "Fried Rice",
        categoryId: "rice-meals",
        itemType: "configured-meal",
        image: "images/fried-rice.jpg",
        description: "Fried rice served with a selected protein",
        active: true,
        portionIds: ["fried-rice-regular"],
        allowedExtraIds: ["extra-chicken", "fried-egg", "extra-rice"]
      },
      {
        id: "kenkey",
        name: "Kenkey",
        categoryId: "kenkey-meals",
        itemType: "configured-meal",
        image: "images/kenkey.jpg",
        description: "Kenkey served with pepper and a selected protein",
        active: true,
        portionIds: ["kenkey-regular"],
        allowedExtraIds: ["extra-fish", "fried-egg", "extra-pepper"]
      }
    ],

    portions: [
      {
        id: "jollof-regular",
        menuItemId: "jollof",
        name: "Regular Portion",
        price: 42,
        includedDescription: "3 scoops of rice",
        proteinRequired: true,
        allowedProteinIds: ["fish-cut", "chicken-leg"],
        active: true
      },
      {
        id: "jollof-large",
        menuItemId: "jollof",
        name: "Large Portion",
        price: 55,
        includedDescription: "5 scoops of rice",
        proteinRequired: true,
        allowedProteinIds: ["fish-cut", "chicken-leg"],
        active: true
      },
      {
        id: "fried-rice-regular",
        menuItemId: "fried-rice",
        name: "Regular Portion",
        price: 45,
        includedDescription: "3 scoops of fried rice",
        proteinRequired: true,
        allowedProteinIds: ["fish-cut", "chicken-leg"],
        active: true
      },
      {
        id: "kenkey-regular",
        menuItemId: "kenkey",
        name: "Regular Portion",
        price: 30,
        includedDescription: "2 balls of kenkey with pepper",
        proteinRequired: true,
        allowedProteinIds: ["fish-cut"],
        active: true
      }
    ],

    proteins: [
      { id: "fish-cut", name: "Fish Cut", additionalPrice: 0, active: true },
      { id: "chicken-leg", name: "Chicken Leg", additionalPrice: 0, active: true }
    ],

    extras: [
      { id: "extra-rice", name: "Extra Rice Scoop", price: 5, maximumQuantity: 5, active: true },
      { id: "extra-fish", name: "Extra Fish Cut", price: 12, maximumQuantity: 3, active: true },
      { id: "extra-chicken", name: "Extra Chicken Leg", price: 15, maximumQuantity: 3, active: true },
      { id: "fried-egg", name: "Fried Egg", price: 5, maximumQuantity: 3, active: true },
      { id: "extra-pepper", name: "Extra Pepper", price: 2, maximumQuantity: 3, active: true }
    ],

    // Inventory products. Stock is reduced only after a completed sale.
    inventoryProducts: [
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
    ]
  };

  global.GCK = global.GCK || {};
  global.GCK.seedData = SEED_DATA;
})(window);
