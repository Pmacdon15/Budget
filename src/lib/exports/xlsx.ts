import "server-only";
import { deflateRawSync } from "node:zlib";

import { zipSync } from "@/lib/exports/zip";

const deflate = (data: Uint8Array) => new Uint8Array(deflateRawSync(data));

// A minimal .xlsx (Office Open XML) writer: several sheets of text, numbers,
// dates and formulas with a handful of fixed styles. That is all the receipt
// spreadsheet needs, and it keeps a heavyweight spreadsheet library out of the
// server bundle. Strings are written inline, so there is no shared-strings
// table to keep in step.

export type CellStyle =
  | "default"
  | "header"
  | "money"
  | "moneyBold"
  | "date"
  | "title"
  | "percent"
  | "bold"
  | "muted"
  | "integer";

export type Cell =
  | null
  | undefined
  | string
  | number
  | { value: string | number | null; style?: CellStyle }
  /** A YYYY-MM-DD calendar date, stored as a real Excel date. */
  | { date: string; style?: CellStyle }
  /** `value` is the cached result shown before the sheet recalculates. */
  | { formula: string; value?: number; style?: CellStyle };

export type Sheet = {
  name: string;
  /** Column widths in characters, left to right. */
  columns?: number[];
  rows: Cell[][];
  /** Rows kept on screen while scrolling (a header row, usually 1). */
  freezeRows?: number;
  /** Adds filter buttons over this header row (0-based) and the rows below. */
  autoFilterRow?: number;
  /** Print across one page wide, in landscape. */
  landscape?: boolean;
};

// Index into cellXfs in styles.xml below; keep the two in the same order.
const STYLE_INDEX: Record<CellStyle, number> = {
  default: 0,
  header: 1,
  money: 2,
  date: 3,
  moneyBold: 4,
  title: 5,
  percent: 6,
  bold: 7,
  muted: 8,
  integer: 9,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Characters XML 1.0 cannot carry at all (most control characters). Receipt
// text comes from OCR and model output, so it is stripped, not trusted.
const INVALID_XML =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: this lists the control characters XML allows, to strip the rest.
  /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function cellRef(row: number, column: number): string {
  return `${columnName(column)}${row + 1}`;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel's serial day number for a YYYY-MM-DD date, or null if it is not one. */
export function excelDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(ms) ? null : Math.round((ms - EXCEL_EPOCH) / 86_400_000);
}

/** Sheet names: at most 31 characters, none of []:*?/\ and unique. */
function sheetNames(sheets: readonly Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base =
      sheet.name
        .replace(/[[\]:*?/\\]/g, " ")
        .trim()
        .slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(cell: Cell, ref: string): string {
  if (cell == null) return "";

  if (typeof cell === "string") {
    return cell === ""
      ? ""
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  }
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? `<c r="${ref}"><v>${cell}</v></c>` : "";
  }

  const s = STYLE_INDEX[cell.style ?? "default"];
  const styleAttr = s ? ` s="${s}"` : "";

  if ("formula" in cell) {
    const cached =
      cell.value !== undefined && Number.isFinite(cell.value)
        ? `<v>${cell.value}</v>`
        : "";
    return `<c r="${ref}"${styleAttr}><f>${escapeXml(cell.formula)}</f>${cached}</c>`;
  }

  if ("date" in cell) {
    const serial = excelDate(cell.date);
    if (serial === null) return "";
    const dateStyle = STYLE_INDEX[cell.style ?? "date"];
    return `<c r="${ref}" s="${dateStyle}"><v>${serial}</v></c>`;
  }

  const value = cell.value;
  if (value == null || value === "") {
    // A styled empty cell keeps a header fill or border continuous.
    return s ? `<c r="${ref}"${styleAttr}/>` : "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? `<c r="${ref}"${styleAttr}><v>${value}</v></c>`
      : "";
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet, index: number): string {
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const height = Math.max(1, sheet.rows.length);
  const dimension = `A1:${cellRef(height - 1, width - 1)}`;

  const freeze = sheet.freezeRows ?? 0;
  const pane =
    freeze > 0
      ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze + 1}" sqref="A${freeze + 1}"/>`
      : "";
  const views = `<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ""}>${pane}</sheetView></sheetViews>`;

  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, cellRef(r, c))).join("");
      return cells ? `<row r="${r + 1}">${cells}</row>` : "";
    })
    .join("");

  const filter =
    sheet.autoFilterRow !== undefined
      ? `<autoFilter ref="${filterRange(sheet)}"/>`
      : "";

  const pageSetup = sheet.landscape
    ? `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
    : "";
  const sheetPr = sheet.landscape
    ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sheetPr}<dimension ref="${dimension}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${pageSetup}</worksheet>`;
}

function filterRange(sheet: Sheet): string {
  const header = sheet.autoFilterRow ?? 0;
  const width = Math.max(1, sheet.rows[header]?.length ?? 1);
  // Through the last row with anything in it, so a totals row below a gap
  // stays out of the filter.
  let last = header;
  for (let r = header + 1; r < sheet.rows.length; r++) {
    if (sheet.rows[r].some((c) => c != null && c !== "")) last = r;
    else break;
  }
  return `A${header + 1}:${cellRef(last, width - 1)}`;
}

/** The .xlsx file's bytes. */
export function buildXlsx(
  sheets: readonly Sheet[],
  { title, modified = new Date() }: { title?: string; modified?: Date } = {},
): Uint8Array {
  const names = sheetNames(sheets);
  const encoder = new TextEncoder();
  const file = (name: string, xml: string) => ({
    name,
    data: encoder.encode(xml),
    modified,
    compress: true,
  });

  const definedNames = sheets
    .map((sheet, i) =>
      sheet.autoFilterRow === undefined
        ? ""
        : `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(names[i].replace(/'/g, "''"))}'!${absolute(filterRange(sheet))}</definedName>`,
    )
    .join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names
    .map(
      (name, i) =>
        `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join(
      "",
    )}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join(
      "",
    )}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join(
      "",
    )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  const stamp = modified.toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${title ? `<dc:title>${escapeXml(title)}</dc:title>` : ""}<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;

  return zipSync(
    [
      file("[Content_Types].xml", contentTypes),
      file("_rels/.rels", rootRels),
      file("docProps/core.xml", core),
      file("xl/workbook.xml", workbook),
      file("xl/_rels/workbook.xml.rels", workbookRels),
      file("xl/styles.xml", STYLES_XML),
      ...sheets.map((sheet, i) =>
        file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, i)),
      ),
    ],
    { deflate },
  );
}

function absolute(range: string): string {
  return range
    .split(":")
    .map((ref) => ref.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2"))
    .join(":");
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
