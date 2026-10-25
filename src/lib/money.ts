const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const compact = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMoney(cents: number) {
  return currency.format(cents / 100);
}

export function formatMoneyCompact(cents: number) {
  return compact.format(cents / 100);
}

/** Parses "1,234.56" or "$1234.5" into integer cents. Returns null when invalid. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number.parseFloat(cleaned) * 100);
}

/**
 * Like `parseMoney`, but also takes a leading minus for amounts below zero,
 * such as an overdrawn bank balance: "-123.45", "-$123.45" and "$-123.45" all
 * give -12345. Accepts the Unicode minus (−) and en dash (–) some keyboards
 * type instead of "-". Returns null when invalid.
 */
export function parseSignedMoney(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "").replace(/[−–]/g, "-");
  const match = /^(-?)\$?(-?)(.*)$/.exec(cleaned);
  if (!match) return null;
  const [, before, after, rest] = match;
  if (before && after) return null;
  if (rest.startsWith("$")) return null;
  const cents = parseMoney(rest);
  if (cents === null) return null;
  return before || after ? -cents || 0 : cents;
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
