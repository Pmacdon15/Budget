import { describe, expect, it } from "vitest";
import { createApiKey } from "@/actions/api-keys";
import { POST } from "@/app/api/mcp/route";

/*
 * Every tool's input schema, as tools/list advertises it, stays inside the
 * JSON Schema subset all MCP clients accept. Gemini is the strictest: it
 * rejects the whole tool list over one unknown keyword or an object without
 * properties.
 */

const ALLOWED = new Set([
  "type",
  "description",
  "title",
  "properties",
  "required",
  "items",
  "enum",
  "anyOf",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "nullable",
  "default",
]);

type Schema = Record<string, unknown>;

function problems(schema: Schema, path: string): string[] {
  const found: string[] = [];
  for (const key of Object.keys(schema)) {
    if (!ALLOWED.has(key)) found.push(`${path}: unsupported keyword ${key}`);
  }
  if (schema.anyOf) {
    for (const [i, branch] of (schema.anyOf as Schema[]).entries()) {
      found.push(...problems(branch, `${path}.anyOf[${i}]`));
    }
  } else if (typeof schema.type !== "string") {
    found.push(`${path}: no single explicit type`);
  }
  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    if (Object.keys(properties).length === 0) {
      found.push(`${path}: object without properties`);
    }
    for (const [name, child] of Object.entries(properties)) {
      found.push(...problems(child, `${path}.${name}`));
    }
    for (const name of (schema.required ?? []) as string[]) {
      if (!(name in properties))
        found.push(`${path}: required ${name} missing`);
    }
  }
  if (schema.type === "array") {
    found.push(...problems((schema.items ?? {}) as Schema, `${path}[]`));
  }
  if (schema.format !== undefined && schema.format !== "date-time") {
    found.push(`${path}: format ${schema.format}`);
  }
  return found;
}

describe("tool schemas every client accepts", () => {
  it("advertise only portable JSON Schema", async () => {
    const created = await createApiKey({ name: "schema check" });
    if (!created.ok) throw new Error(created.error);
    const res = await POST(
      new Request("https://budget.patmac.ca/api/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.key}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    const { result } = await res.json();
    expect(result.tools.length).toBeGreaterThanOrEqual(15);
    for (const tool of result.tools as {
      name: string;
      inputSchema: Schema;
    }[]) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(problems(tool.inputSchema, tool.name)).toEqual([]);
    }
  });
});
