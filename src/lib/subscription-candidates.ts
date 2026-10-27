/*
 * Finding saved expenses that look like subscriptions or memberships, so the
 * Spending page can offer to turn them into fixed bills. Pure functions: the
 * DAL reads the expenses and bills, the user picks which ones to convert.
 *
 * An expense is a candidate when its name reads like a subscription or
 * membership, it's filed under Subscriptions, or the same merchant charged a
 * similar amount once a month in two or more months. Usage charges (API
 * credits, top-ups, usage fees) are never candidates: they aren't a plan.
 */

import {
  type BillMatch,
  DEFAULT_AMOUNT_TOLERANCE,
  looksLikeUsage,
  type MatchableBill,
  matchBills,
  tokens,
} from "@/lib/bill-matching";
import { isActive } from "@/lib/budget";
import { type Category, isCategory } from "@/lib/categories";
import type { Expense, FixedItem } from "@/lib/types";

/** How many months back (including the one viewed) are looked at. */
export const CANDIDATE_MONTHS = 6;

/** Words and services that say a charge is a subscription or membership. */
const SUBSCRIPTION =
  /\b(subscriptions?|subscr|memberships?|member fee|dues|monthly (plan|fee)|annual (plan|fee)|premium|renewal|auto[- ]?renew(al)?|netflix|spotify|disney|crave|paramount|apple ?(music|tv|one)|icloud|google one|youtube (premium|tv)|amazon prime|prime video|patreon|audible|adobe|microsoft 365|office 365|game ?pass|playstation plus|ps plus|nintendo switch online|dropbox|chatgpt plus|claude pro|gym|fitness|goodlife)\b/i;

/** True when a charge's name reads like a subscription or membership. */
export function looksLikeSubscription(text: string) {
  return SUBSCRIPTION.test(text);
}

/** Why an expense was suggested. */
export type CandidateReason = "keyword" | "category" | "recurring";

export type CandidateExpense = Pick<
  Expense,
  "id" | "month" | "spentOn" | "description" | "category" | "amountCents"
>;

export type SubscriptionCandidate = {
  /** Stable for one set of expenses: the newest expense's id. */
  key: string;
  /** The bill's suggested name: the newest charge's description. */
  name: string;
  category: Category;
  /** The newest charge's amount: what the bill is a month now. */
  amountCents: number;
  /** The day of the month the newest charge came out. */
  dueDay: number;
  reasons: CandidateReason[];
  /** One charge per month, oldest first. Converting makes each its month's payment. */
  expenses: CandidateExpense[];
  /** An existing bill this already looks like: pay that instead of adding a new one. */
  match: BillMatch | null;
};

/** At most this many charges a month from one merchant still reads as a plan, not shopping. */
const MAX_CHARGES_A_MONTH = 2;

/** The merchant part of a description: its first two words that aren't numbers. */
export function merchantGroup(description: string): string | null {
  const words = tokens(description).filter((t) => !/^\d+$/.test(t));
  return words.length > 0 ? words.slice(0, 2).join(" ") : null;
}

const within = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <= Math.max(a, b) * tolerance;

const newestFirst = (a: CandidateExpense, b: CandidateExpense) =>
  b.spentOn.localeCompare(a.spentOn) || b.id.localeCompare(a.id);

/**
 * Splits one merchant's charges into runs of similar amounts with at most one
 * charge a month each, newest first. Two plans from one company (Apple at
 * $3.99 and $12.99) stay apart.
 */
function clusters(
  charges: CandidateExpense[],
  tolerance: number,
): CandidateExpense[][] {
  const runs: CandidateExpense[][] = [];
  for (const charge of [...charges].sort(newestFirst)) {
    const run = runs.find(
      (r) =>
        r[0] !== undefined &&
        within(r[0].amountCents, charge.amountCents, tolerance) &&
        !r.some((c) => c.month === charge.month),
    );
    if (run) run.push(charge);
    else runs.push([charge]);
  }
  return runs;
}

/**
 * The expenses that look like subscriptions, grouped into the bills they'd
 * become, newest first. `expenses` are the user's saved expenses (not already
 * a bill's payment); `bills` are all their fixed bill rows, to spot a bill it
 * already is.
 */
export function findSubscriptionCandidates(
  expenses: readonly (CandidateExpense & { unpaid?: boolean })[],
  bills: readonly FixedItem[],
  tolerance = DEFAULT_AMOUNT_TOLERANCE,
): SubscriptionCandidate[] {
  const groups = new Map<string, CandidateExpense[]>();
  for (const expense of expenses) {
    // Not paid yet: it can't be a bill's payment until the money has left.
    if (expense.unpaid) continue;
    if (looksLikeUsage({ merchant: expense.description })) continue;
    const key = merchantGroup(expense.description);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(expense);
    groups.set(key, group);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const charges of groups.values()) {
    const perMonth = new Map<string, number>();
    for (const c of charges) {
      perMonth.set(c.month, (perMonth.get(c.month) ?? 0) + 1);
    }
    const shopping = [...perMonth.values()].some(
      (n) => n > MAX_CHARGES_A_MONTH,
    );

    for (const run of clusters(charges, tolerance)) {
      const newest = run[0];
      if (!newest) continue;
      const reasons: CandidateReason[] = [];
      if (run.some((c) => looksLikeSubscription(c.description))) {
        reasons.push("keyword");
      }
      if (run.some((c) => c.category === "Subscriptions")) {
        reasons.push("category");
      }
      if (!shopping && run.length >= 2) reasons.push("recurring");
      if (reasons.length === 0) continue;

      candidates.push({
        key: newest.id,
        name: newest.description,
        category: isCategory(newest.category)
          ? newest.category
          : "Subscriptions",
        amountCents: newest.amountCents,
        dueDay: Number(newest.spentOn.slice(8, 10)),
        reasons,
        expenses: [...run].reverse(),
        match: existingBill(bills, newest),
      });
    }
  }
  return candidates.sort(
    (a, b) =>
      (b.expenses.at(-1)?.spentOn ?? "").localeCompare(
        a.expenses.at(-1)?.spentOn ?? "",
      ) || a.name.localeCompare(b.name),
  );
}

/**
 * The bill (active in the charge's month) a charge already looks like, using
 * the same matching as find_matching_fixed_bill. Null when none does.
 */
export function existingBill(
  bills: readonly FixedItem[],
  charge: Pick<
    CandidateExpense,
    "description" | "amountCents" | "spentOn" | "month"
  >,
): BillMatch | null {
  const active: MatchableBill[] = bills.filter((b) =>
    isActive(b, charge.month),
  );
  const [best] = matchBills(active, {
    merchant: charge.description,
    amountCents: charge.amountCents,
    date: charge.spentOn,
  });
  return best ?? null;
}
