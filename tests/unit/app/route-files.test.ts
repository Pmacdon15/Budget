import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Rules for every page and layout in `src/app`, found on disk so new routes are
 * covered automatically. They keep each route's static shell as large as
 * possible under Cache Components:
 *
 * - Pages and layouts are Server Components, and not `async`. Request data
 *   (`searchParams`, `params`, the session, the database) is passed down as a
 *   promise and awaited inside a small `<Suspense>` hole, or read with
 *   `.then()` there, so everything above the hole prerenders.
 * - No route segment config that opts a route into request-time rendering.
 */

const APP_DIR = path.resolve(__dirname, "../../../src/app");
const ROUTE_FILE = /^(page|layout|template|default)\.(tsx|ts|jsx|js)$/;

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(full);
    return ROUTE_FILE.test(entry.name) ? [full] : [];
  });
}

const files = findRouteFiles(APP_DIR).map((file) => ({
  file,
  name: path.relative(APP_DIR, file),
}));

function parse(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

const isFunctionLike = (node: ts.Node): node is FunctionLike =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node);

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/** The function behind `export default …`, following one identifier if needed. */
function defaultExport(source: ts.SourceFile): FunctionLike | undefined {
  let name: string | undefined;
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expr = statement.expression;
      if (isFunctionLike(expr)) return expr;
      if (ts.isIdentifier(expr)) name = expr.text;
    }
  }
  if (!name) return undefined;
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === name &&
          decl.initializer &&
          isFunctionLike(decl.initializer)
        ) {
          return decl.initializer;
        }
      }
    }
  }
  return undefined;
}

/** `await` (or `for await`) in the function's own body, not in nested functions. */
function findOwnAwait(fn: FunctionLike): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (node !== fn && isFunctionLike(node)) return;
    if (
      ts.isAwaitExpression(node) ||
      (ts.isForOfStatement(node) && node.awaitModifier)
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

const hasUseClient = (source: ts.SourceFile) =>
  source.statements.some(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isStringLiteral(s.expression) &&
      s.expression.text === "use client",
  );

/** `export const name = value` for route segment config. */
function exportedConsts(source: ts.SourceFile) {
  const consts = new Map<string, string>();
  for (const statement of source.statements) {
    if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          consts.set(decl.name.text, decl.initializer?.getText(source) ?? "");
        }
      }
    }
  }
  return consts;
}

const lineOf = (source: ts.SourceFile, node: ts.Node) =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

describe("route files", () => {
  it("finds every page and layout", () => {
    const names = files.map((f) => f.name);
    expect(names).toContain("layout.tsx");
    expect(names).toContain(path.join("(app)", "layout.tsx"));
    expect(names).toContain(path.join("(app)", "page.tsx"));
    expect(names.filter((n) => n.endsWith(`page.tsx`)).length).toBeGreaterThan(
      5,
    );
  });

  describe.each(files)("$name", ({ file }) => {
    const source = parse(file);

    it("is a Server Component", () => {
      expect(hasUseClient(source), '"use client" in a route file').toBe(false);
    });

    it("default-exports a component that isn't async", () => {
      const fn = defaultExport(source);
      expect(fn, "no default-exported function").toBeDefined();
      expect(
        fn && hasModifier(fn, ts.SyntaxKind.AsyncKeyword),
        "async page/layout: pass the promise down and await it inside <Suspense>",
      ).toBe(false);
    });

    it("doesn't await anything at the top of the component", () => {
      const fn = defaultExport(source);
      const awaited = fn && findOwnAwait(fn);
      expect(
        awaited ? `await on line ${lineOf(source, awaited)}` : null,
        "move the await into a child component inside <Suspense>, or use .then()",
      ).toBeNull();
    });

    it("doesn't opt the route into request-time rendering", () => {
      const consts = exportedConsts(source);
      // Route segment configs from before Cache Components. They either fail
      // the build or make the whole route dynamic.
      for (const legacy of ["dynamic", "revalidate", "fetchCache", "runtime"]) {
        expect(consts.has(legacy), `export const ${legacy}`).toBe(false);
      }
      expect(consts.get("ensureStatic"), "ensureStatic = false").not.toBe(
        "false",
      );
    });
  });
});
