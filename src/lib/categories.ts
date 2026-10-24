/**
 * Budget categories.
 *
 * `name` is the stored key: it is what the database, forms, URLs and the
 * receipt reader use, so it never changes once shipped (renaming it would
 * orphan saved expenses). `label` is what people see, worded to match the CRA
 * T2125 business-expense lines where one fits, so self-employed users can
 * total each line at tax time. `hint` says what belongs in each; it is shown
 * to the receipt reader so its guesses land where a person would put them.
 */
export const CATEGORIES = [
  {
    name: "Housing",
    label: "Rent & Home",
    color: "oklch(0.62 0.17 255)",
    hint: "rent, mortgage, property tax, home repairs, home office costs",
  },
  {
    name: "Utilities",
    label: "Utilities & Phone",
    color: "oklch(0.72 0.15 200)",
    hint: "power, water, natural gas, internet, phone",
  },
  {
    name: "Transportation",
    label: "Fuel & Travel",
    color: "oklch(0.70 0.16 145)",
    hint: "gas and fuel, transit, parking, taxis and rideshare, flights and hotels",
  },
  {
    name: "Auto",
    label: "Motor Vehicle",
    color: "oklch(0.56 0.13 45)",
    hint: "car repairs, maintenance, oil changes, tires, parts, car wash, registration",
  },
  {
    name: "Insurance",
    label: "Insurance",
    color: "oklch(0.60 0.14 290)",
    hint: "car, home, life and health insurance premiums",
  },
  {
    name: "Debt",
    label: "Interest & Bank Charges",
    color: "oklch(0.63 0.20 25)",
    hint: "loan and credit card payments, interest, bank and card fees",
  },
  {
    name: "Subscriptions",
    label: "Subscriptions & Memberships",
    color: "oklch(0.70 0.17 320)",
    hint: "streaming, software, memberships, professional dues, licences",
  },
  {
    name: "Groceries",
    label: "Groceries",
    color: "oklch(0.78 0.16 85)",
    hint: "food and household staples from a grocery store, to cook at home",
  },
  {
    name: "Food",
    label: "Food",
    color: "oklch(0.76 0.15 120)",
    hint: "snacks, drinks and ready-to-eat food on the go: convenience stores, bakeries, coffee to go",
  },
  {
    name: "Dining",
    label: "Meals & Dining",
    color: "oklch(0.72 0.17 50)",
    hint: "restaurants, fast food, takeout and delivery meals",
  },
  {
    name: "Alcohol",
    label: "Alcohol",
    color: "oklch(0.52 0.17 5)",
    hint: "beer, wine, spirits and liquor store purchases",
  },
  {
    name: "Health",
    label: "Health",
    color: "oklch(0.68 0.13 170)",
    hint: "pharmacy, prescriptions, dental, clinics",
  },
  {
    name: "Personal",
    label: "Personal",
    color: "oklch(0.66 0.10 230)",
    hint: "clothing, haircuts, toiletries, household goods",
  },
  {
    name: "Entertainment",
    label: "Entertainment",
    color: "oklch(0.65 0.19 350)",
    hint: "movies, events, games, hobbies",
  },
  {
    name: "Savings",
    label: "Savings",
    color: "oklch(0.60 0.13 160)",
    hint: "money set aside or invested",
  },
  {
    name: "Office",
    label: "Office & Supplies",
    color: "oklch(0.58 0.09 210)",
    hint: "office supplies, stationery, printer ink, postage, small equipment",
  },
  {
    name: "Advertising",
    label: "Advertising",
    color: "oklch(0.74 0.14 65)",
    hint: "ads, marketing, business cards, signs, website and listing fees",
  },
  {
    name: "Professional",
    label: "Professional Fees",
    color: "oklch(0.55 0.12 270)",
    hint: "accounting, bookkeeping, legal and tax preparation fees",
  },
  {
    name: "Other",
    label: "Other",
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

/** What a stored category is called on screen and in downloads. */
export function categoryLabel(name: string) {
  return CATEGORIES.find((c) => c.name === name)?.label ?? name;
}

export function categoryColor(name: string) {
  return (
    CATEGORIES.find((c) => c.name === name)?.color ?? "oklch(0.62 0.02 260)"
  );
}
