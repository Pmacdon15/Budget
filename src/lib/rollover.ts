import { z } from "zod";
import { type Category, isCategory } from "@/lib/categories";
import type { BudgetProgress } from "@/lib/category-budgets";
import { parseMoney } from "@/lib/money";
import { addMonths } from "@/lib/month";
import { monthSchema } from "@/lib/schemas";

/*
 * Rolling unspent money over: optionally carry what's left of a category's
 * budget into the next month. Off by default. The user picks the month it
 * starts from and can set the real amount carried into any month by hand,
 * because the first month (and any month with missing receipts) is rarely
 * clean. Shared by the browser and the server.
 */

export type RolloverSettings = {
  enabled: boolean;
  /** The first month whose unspent money carries forward. */
  startMonth: string;
  /** Budgeted categories that don't roll over. */
  excluded: string[];
};

/** What a user who never turned rollover on gets. */
export const rolloverOff = (startMonth: string): RolloverSettings => ({
  enabled: false,
  startMonth,
  excluded: [],
});

/** Form field names, e.g. `rollover_Groceries` and `carry_Groceries`. */
export const includeField = (category: Category) =>
  `rollover_${category}` as const;
export const carryField = (category: Category) => `carry_${category}` as const;

const optionalAmount = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const cents = parseMoney(trimmed);
    if (cents === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount, like 50.00",
      });
      return z.NEVER;
    }
    return cents;
  });

/**
 * The rollover form. `categories` lists the categories shown (the ones with a
 * budget that month), comma separated; for each, an unticked
 * `rollover_<category>` box leaves it out of rollover, and `carry_<category>`
 * sets the real amount carried into `month` (blank uses the calculated one).
 */
export const rolloverSchema = z
  .looseObject({
    month: monthSchema,
    enabled: z.string().optional(),
    startMonth: z
      .string()
      .refine((value) => monthSchema.safeParse(value).success, {
        message: "Pick the month rollover starts from",
      }),
    categories: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const names = (value ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        const unknown = names.find((name) => !isCategory(name));
        if (unknown) {
          ctx.addIssue({ code: "custom", message: "Unknown category" });
          return z.NEVER;
        }
        return [...new Set(names)] as Category[];
      }),
  })
  .transform((values, ctx) => {
    const raw = values as Record<string, unknown>;
    const categories = values.categories.map((category) => {
      const field = carryField(category);
      const parsed = optionalAmount.safeParse(raw[field]);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: parsed.error.issues[0]?.message ?? "Invalid amount",
        });
        return { category, included: true, carriedCents: null };
      }
      return {
        category,
        included: raw[includeField(category)] === "on",
        carriedCents: parsed.data,
      };
    });
    return {
      month: values.month,
      enabled: values.enabled === "on",
      startMonth: values.startMonth,
      categories,
    };
  });

export type RolloverFormValues = z.input<typeof rolloverSchema>;
export type RolloverInput = z.output<typeof rolloverSchema>;

/* ---------- The math ---------- */

/** A stored category_budgets row: the limit from `startMonth` on (null clears it). */
export type LimitRow = {
  category: string;
  startMonth: string;
  limitCents: number | null;
};

/** The limit in force for `category` in `month`; 0 when there's none. */
export function limitIn(rows: LimitRow[], category: string, month: string) {
  let found: LimitRow | undefined;
  for (const row of rows) {
    if (row.category !== category || row.startMonth > month) continue;
    if (!found || row.startMonth > found.startMonth) found = row;
  }
  return found?.limitCents ?? 0;
}

export const adjustmentKey = (category: string, month: string) =>
  `${category}|${month}`;

export type RolloverAmount = {
  category: string;
  /** What's carried into the month: the hand-set amount when there is one. */
  carriedCents: number;
  /** What the budgets and spending alone would carry in. */
  calculatedCents: number;
  /** True when the user set this month's amount by hand. */
  adjusted: boolean;
};

/**
 * What each category carries into `month`.
 *
 * Nothing carries into the start month unless it was set by hand. After that,
 * each month carries `limit + carried in - spent` (never below zero) into the
 * next, where spent is fixed bills plus spending, paid or not. A hand-set
 * amount replaces the calculated one for its month and later months build on
 * it. Off, before the start month, or for an excluded category: nothing.
 */
export function rolloverAmounts({
  settings,
  month,
  categories,
  limit,
  spent,
  adjustments,
}: {
  settings: RolloverSettings;
  month: string;
  /** The categories to work out, usually those with a budget in `month`. */
  categories: string[];
  limit: (category: string, month: string) => number;
  spent: (category: string, month: string) => number;
  /** Hand-set amounts, keyed by `adjustmentKey`. */
  adjustments: Map<string, number>;
}): RolloverAmount[] {
  if (!settings.enabled || month < settings.startMonth) return [];
  const excluded = new Set(settings.excluded);

  return categories
    .filter((category) => !excluded.has(category))
    .map((category) => {
      let calculated = 0;
      let carried =
        adjustments.get(adjustmentKey(category, settings.startMonth)) ?? 0;
      for (let m = settings.startMonth; m < month; m = addMonths(m, 1)) {
        calculated = Math.max(
          0,
          limit(category, m) + carried - spent(category, m),
        );
        carried =
          adjustments.get(adjustmentKey(category, addMonths(m, 1))) ??
          calculated;
      }
      const hand = adjustments.get(adjustmentKey(category, month));
      return {
        category,
        carriedCents: carried,
        calculatedCents: calculated,
        adjusted: hand !== undefined,
      };
    });
}

export type RolledProgress = BudgetProgress & {
  /** Carried in from last month; 0 when rollover is off for the category. */
  carriedCents: number;
  /** The limit plus what was carried in. */
  availableCents: number;
};

/** Adds what each category carried in, so "left" and usage count it. */
export function applyRollover(
  progress: BudgetProgress[],
  amounts: RolloverAmount[],
): RolledProgress[] {
  const carried = new Map(amounts.map((a) => [a.category, a.carriedCents]));
  return progress.map((row) => {
    const carriedCents = carried.get(row.category) ?? 0;
    const availableCents = row.limitCents + carriedCents;
    return {
      ...row,
      carriedCents,
      availableCents,
      leftCents: availableCents - row.spentCents,
      usage:
        availableCents > 0
          ? row.spentCents / availableCents
          : row.spentCents > 0
            ? Number.POSITIVE_INFINITY
            : 0,
    };
  });
}
