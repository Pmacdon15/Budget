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

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
