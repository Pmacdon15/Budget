import { z } from "zod";

/*
 * Personal API keys, for AI apps that can't sign in to the MCP server with
 * OAuth. Shared by browser and server; generating and hashing a key is
 * server-only (`src/lib/api-key-token.ts`).
 */

/** Every key starts with this, so it's recognisable and never mistaken for an OAuth token. */
export const API_KEY_PREFIX = "bgt_";

export type ApiKey = {
  id: string;
  name: string;
  /** The key's first characters, e.g. "bgt_a1B2c3", to tell keys apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export const apiKeyNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name the key, like the app it's for")
    .max(60, "That name is too long"),
});

export type ApiKeyNameFormValues = z.input<typeof apiKeyNameSchema>;
