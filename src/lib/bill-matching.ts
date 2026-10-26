/*
 * Matching a charge (found in an email, or already saved) to the user's fixed
 * bills. A bill matches when the merchant looks like the bill's name, merchant
 * or one of its match keywords. How close the amount is and how near the date
 * is to the bill's due day then decide how good the match is and what to
 * suggest. Pure functions, shared by the MCP tools and the Review page.
 */

import { formatMoney } from "@/lib/money";

/** Suggest a match when the amount is within this share of the bill's amount. */
export const DEFAULT_AMOUNT_TOLERANCE = 0.15;

/** The least a candidate's score can be to be suggested at all. */
const MIN_SCORE = 0.45;

/** Below this, the names don't look alike enough, whatever the amount. */
const MIN_NAME_SCORE = 0.5;

export type MatchableBill = {
  id: string;
  name: string;
  merchant?: string | null;
  matchKeywords?: string[];
  amountCents: number;
  dueDay: number | null;
  isEstimate?: boolean;
};

export type Charge = {
  merchant: string;
  description?: string | null;
  amountCents: number;
  /** YYYY-MM-DD. */
  date: string;
};

/**
 * - `same_amount`: it's this bill, at its amount: link it and mark the month paid.
 * - `amount_differs`: it's this bill at a different price (or the bill's
 *   amount was an estimate): suggest updating the bill, then link it.
 * - `amount_far`: the name matches but the amount is well off: ask the user
 *   whether it's this bill (a big price change) or a separate charge.
 */
export type MatchKind = "same_amount" | "amount_differs" | "amount_far";

export type BillMatch = {
  bill: MatchableBill;
  kind: MatchKind;
  /** 0 to 1. */
  score: number;
  nameScore: number;
  /** The charge less the bill's amount, in cents. */
  differenceCents: number;
  /** The charge reads like usage or credits (top-up, prepaid, API), not a plan. */
  looksLikeUsage: boolean;
  /** A sentence the AI can show the user as is. */
  suggestion: string;
};

/** Words in a charge that point to usage or credits rather than a subscription. */
const USAGE =
  /\b(credits?|usage|top[- ]?up|prepaid|pay[- ]as[- ]you[- ]go|overage|extra usage|api)\b/i;

/** True when the charge reads like a usage charge, not a subscription. */
export function looksLikeUsage(
  charge: Pick<Charge, "merchant" | "description">,
) {
  return USAGE.test(`${charge.merchant} ${charge.description ?? ""}`);
}

/** Words that say nothing about who charged it. */
const NOISE = new Set([
  "inc",
  "ltd",
  "llc",
  "corp",
  "co",
  "com",
  "ca",
  "www",
  "the",
  "and",
  "of",
  "payment",
  "pmt",
  "purchase",
  "pos",
  "bill",
  "invoice",
  "receipt",
  "your",
  "order",
  "monthly",
  "subscription",
  "plan",
  "renewal",
  "auto",
  "online",
]);

/** Lowercase words, accents and punctuation removed, noise words dropped. */
export function tokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

function bigrams(text: string): Set<string> {
  const s = tokens(text).join(" ");
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

/** Dice similarity of two strings' letter pairs, 0 to 1. */
function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return (2 * both) / (x.size + y.size);
}

/** 1 when every word of `name` appears in `text` (as a word or a prefix of one). */
function containment(name: string, text: string): number {
  const want = tokens(name);
  if (want.length === 0) return 0;
  const have = tokens(text);
  const found = want.filter((w) =>
    have.some((h) => h === w || (w.length >= 4 && h.startsWith(w))),
  );
  return found.length / want.length;
}

/** How much the charge looks like the bill by name, 0 to 1. */
export function nameScore(bill: MatchableBill, charge: Charge): number {
  const text = `${charge.merchant} ${charge.description ?? ""}`;
  const names = [
    bill.name,
    ...(bill.merchant ? [bill.merchant] : []),
    ...(bill.matchKeywords ?? []),
  ].filter((n) => tokens(n).length > 0);

  let best = 0;
  for (const name of names) {
    // A keyword or merchant the user gave counts fully when it's all there.
    const contained = containment(name, text);
    const fuzzy = Math.max(
      dice(name, charge.merchant),
      charge.description ? dice(name, charge.description) : 0,
    );
    best = Math.max(best, contained, fuzzy);
  }
  return Math.min(1, best);
}

/** 1 for the same amount, falling to 0 at the tolerance. */
function amountScore(
  billCents: number,
  chargeCents: number,
  tolerance: number,
): number {
  if (billCents === chargeCents) return 1;
  const ratio = Math.abs(chargeCents - billCents) / Math.max(billCents, 1);
  return ratio >= tolerance ? 0 : 1 - ratio / tolerance;
}

/** 1 within 3 days of the due day (wrapping round the month), 0.5 within a week. */
function dayScore(dueDay: number | null, date: string): number {
  if (dueDay == null) return 0.5;
  const day = Number(date.slice(8, 10));
  const gap = Math.abs(day - dueDay);
  const distance = Math.min(gap, 31 - gap);
  if (distance <= 3) return 1;
  if (distance <= 7) return 0.5;
  return 0;
}

function suggestionFor(
  kind: MatchKind,
  bill: MatchableBill,
  charge: Charge,
  usage: boolean,
): string {
  const was = formatMoney(bill.amountCents);
  const now = formatMoney(charge.amountCents);
  const month = charge.date.slice(0, 7);
  if (kind === "same_amount") {
    return `This is the fixed bill "${bill.name}" (${was}). Mark it paid for ${month} with this charge, instead of adding a separate expense?`;
  }
  if (kind === "amount_differs") {
    return bill.isEstimate
      ? `This looks like the fixed bill "${bill.name}", entered as an estimate of ${was}. Update it to the real ${now} and mark ${month} paid?`
      : `This looks like the fixed bill "${bill.name}". Update it from ${was} to ${now} and mark ${month} paid?`;
  }
  if (usage) {
    return `This is from the same company as the fixed bill "${bill.name}" (${was}), but at ${now} it reads like a usage or credits charge, not the subscription. Add it as a normal expense (is_subscription: false) unless the user says it's the bill.`;
  }
  return `The name matches the fixed bill "${bill.name}" (${was}), but this charge is ${now}. Is it that bill at a new price, or a separate charge?`;
}

/**
 * The user's bills this charge could be, best first (three at most). Empty
 * when none looks like it, e.g. a usage charge from a merchant that also has
 * a subscription only matches when its name and amount are close.
 */
export function matchBills(
  bills: MatchableBill[],
  charge: Charge,
  tolerance = DEFAULT_AMOUNT_TOLERANCE,
): BillMatch[] {
  const matches: BillMatch[] = [];
  for (const bill of bills) {
    const byName = nameScore(bill, charge);
    if (byName < MIN_NAME_SCORE) continue;

    const byAmount = amountScore(
      bill.amountCents,
      charge.amountCents,
      tolerance,
    );
    const byDay = dayScore(bill.dueDay, charge.date);
    // An estimate is expected to be off, so its amount counts for less.
    const amountWeight = bill.isEstimate ? 0.2 : 0.3;
    const score =
      byName * (0.9 - amountWeight) + byAmount * amountWeight + byDay * 0.1;
    if (score < MIN_SCORE) continue;

    const usage = looksLikeUsage(charge);
    const kind: MatchKind =
      bill.amountCents === charge.amountCents
        ? "same_amount"
        : byAmount > 0
          ? "amount_differs"
          : "amount_far";
    matches.push({
      bill,
      kind,
      score: Math.round(score * 100) / 100,
      nameScore: Math.round(byName * 100) / 100,
      differenceCents: charge.amountCents - bill.amountCents,
      looksLikeUsage: usage,
      suggestion: suggestionFor(kind, bill, charge, usage),
    });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.bill.name.localeCompare(b.bill.name))
    .slice(0, 3);
}

/** Cleans up match keywords: trimmed, no blanks, no repeats (ignoring case), at most 10. */
export function cleanKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().slice(0, 60);
    const key = k.toLowerCase();
    if (!k || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length === 10) break;
  }
  return out;
}
