/**
 * Budget categories. `hint` says what belongs in each; it is shown to the
 * receipt reader so its guesses land in the same place a person would put them.
 */
export const CATEGORIES = [
  {
    name: "Housing",
    color: "oklch(0.62 0.17 255)",
    hint: "rent, mortgage, property tax, home repairs",
  },
  {
    name: "Utilities",
    color: "oklch(0.72 0.15 200)",
    hint: "power, water, natural gas, internet, phone",
  },
  {
    name: "Transportation",
    color: "oklch(0.70 0.16 145)",
    hint: "gas and fuel, transit, parking, taxis and rideshare",
  },
  {
    name: "Auto",
    color: "oklch(0.56 0.13 45)",
    hint: "car repairs, maintenance, oil changes, tires, parts, car wash, registration",
  },
  {
    name: "Insurance",
    color: "oklch(0.60 0.14 290)",
    hint: "car, home, life and health insurance premiums",
  },
  {
    name: "Debt",
    color: "oklch(0.63 0.20 25)",
    hint: "loan and credit card payments",
  },
  {
    name: "Subscriptions",
    color: "oklch(0.70 0.17 320)",
    hint: "streaming, software, memberships",
  },
  {
    name: "Groceries",
    color: "oklch(0.78 0.16 85)",
    hint: "food and household staples from a grocery store, to cook at home",
  },
  {
    name: "Food",
    color: "oklch(0.76 0.15 120)",
    hint: "snacks, drinks and ready-to-eat food on the go: convenience stores, bakeries, coffee to go",
  },
  {
    name: "Dining",
    color: "oklch(0.72 0.17 50)",
    hint: "restaurants, fast food, takeout and delivery meals",
  },
  {
    name: "Alcohol",
    color: "oklch(0.52 0.17 5)",
    hint: "beer, wine, spirits and liquor store purchases",
  },
  {
    name: "Health",
    color: "oklch(0.68 0.13 170)",
    hint: "pharmacy, prescriptions, dental, clinics",
  },
  {
    name: "Personal",
    color: "oklch(0.66 0.10 230)",
    hint: "clothing, haircuts, toiletries, household goods",
  },
  {
    name: "Entertainment",
    color: "oklch(0.65 0.19 350)",
    hint: "movies, events, games, hobbies",
  },
  {
    name: "Savings",
    color: "oklch(0.60 0.13 160)",
    hint: "money set aside or invested",
  },
  {
    name: "Other",
    color: "oklch(0.62 0.02 260)",
    hint: "anything that fits nowhere else",
  },
] as const;

export type Category = (typeof CATEGORIES)[number]["name"];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name) as [
  Category,
  ...Category[],
];

export function isCategory(value: unknown): value is Category {
  return CATEGORY_NAMES.includes(value as Category);
}

export function categoryColor(name: string) {
  return (
    CATEGORIES.find((c) => c.name === name)?.color ?? "oklch(0.62 0.02 260)"
  );
}
