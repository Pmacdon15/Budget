import { describe, expect, it } from "vitest";
import { z } from "zod";
import { portable, toPortableJsonSchema } from "@/mcp/portable-schema";

const input = (schema: z.ZodType) =>
  portable(schema)["~standard"].jsonSchema.input({ target: "draft-2020-12" });

describe("portable tool schemas", () => {
  it("drops keywords strict clients reject", () => {
    expect(
      toPortableJsonSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string", format: "uuid", pattern: "^x$" } },
      }),
    ).toEqual({
      type: "object",
      properties: { id: { type: "string", pattern: "^x$" } },
    });
  });

  it("keeps the formats Gemini knows", () => {
    expect(
      toPortableJsonSchema({ type: "string", format: "date-time" }),
    ).toEqual({ type: "string", format: "date-time" });
  });

  it("turns exclusive bounds into inclusive ones", () => {
    expect(input(z.object({ a: z.number().positive().max(10) }))).toEqual({
      type: "object",
      properties: { a: { type: "number", minimum: 0, maximum: 10 } },
      required: ["a"],
    });
  });

  it("turns const into a typed one-value enum", () => {
    expect(
      input(z.object({ s: z.union([z.boolean(), z.literal("unknown")]) })),
    ).toEqual({
      type: "object",
      properties: {
        s: {
          anyOf: [{ type: "boolean" }, { type: "string", enum: ["unknown"] }],
        },
      },
      required: ["s"],
    });
  });

  it("turns X | null into a nullable X", () => {
    expect(input(z.object({ d: z.number().int().nullable() }))).toEqual({
      type: "object",
      properties: {
        d: {
          type: "integer",
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER,
          nullable: true,
        },
      },
      required: ["d"],
    });
    expect(toPortableJsonSchema({ type: ["string", "null"] })).toEqual({
      type: "string",
      nullable: true,
    });
  });

  it("rewrites nested objects and array items", () => {
    expect(
      input(
        z.object({
          r: z.object({ total: z.number().positive() }).optional(),
          k: z.array(z.string().min(1)).max(3),
        }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        r: {
          type: "object",
          properties: { total: { type: "number", minimum: 0 } },
          required: ["total"],
        },
        k: {
          type: "array",
          items: { type: "string", minLength: 1 },
          maxItems: 3,
        },
      },
      required: ["k"],
    });
  });

  it("validates with the original schema, exclusive bounds and all", async () => {
    const schema = portable(z.object({ a: z.number().positive() }));
    const validate = schema["~standard"].validate;
    expect(await validate({ a: 1 })).toEqual({ value: { a: 1 } });
    expect(await validate({ a: 0 })).toHaveProperty("issues");
  });
});
