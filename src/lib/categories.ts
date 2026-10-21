export const CATEGORIES = [
  { name: "Housing", color: "oklch(0.62 0.17 255)" },
  { name: "Utilities", color: "oklch(0.72 0.15 200)" },
  { name: "Transportation", color: "oklch(0.70 0.16 145)" },
  { name: "Insurance", color: "oklch(0.60 0.14 290)" },
  { name: "Debt", color: "oklch(0.63 0.20 25)" },
  { name: "Subscriptions", color: "oklch(0.70 0.17 320)" },
  { name: "Groceries", color: "oklch(0.78 0.16 85)" },
  { name: "Dining", color: "oklch(0.72 0.17 50)" },
  { name: "Health", color: "oklch(0.68 0.13 170)" },
  { name: "Personal", color: "oklch(0.66 0.10 230)" },
  { name: "Entertainment", color: "oklch(0.65 0.19 350)" },
  { name: "Savings", color: "oklch(0.60 0.13 160)" },
  { name: "Other", color: "oklch(0.62 0.02 260)" },
] as const;

export type Category = (typeof CATEGORIES)[number]["name"];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name) as [Category, ...Category[]];

export function categoryColor(name: string) {
  return CATEGORIES.find((c) => c.name === name)?.color ?? "oklch(0.62 0.02 260)";
}
