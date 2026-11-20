/** A plain decimal amount like `-15.00`, which a spreadsheet reads as a number. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Leading characters that spreadsheet parsers interpret as formula or DDE prefixes. */
const FORMULA_PREFIX = /^[=+\-@|\t\r\n]/;

/**
 * One CSV cell: quoted where needed, with text a spreadsheet would run as a
 * formula defused by a leading `'` (descriptions can come from receipt text,
 * which is AI output and not trusted to be harmless). Numbers, and amounts
 * already formatted as plain decimals, keep their minus sign.
 */
export function csvCell(value: string | number) {
  let text = String(value);
  if (
    typeof value === "string" &&
    (FORMULA_PREFIX.test(text) || FORMULA_PREFIX.test(text.trimStart())) &&
    !DECIMAL.test(text)
  )
    text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Joins rows of cells into a CSV body. */
export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
