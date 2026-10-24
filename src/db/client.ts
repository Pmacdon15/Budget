import "server-only";
import { type NeonQueryFunction, neon } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | undefined;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Connect a Neon database to this project in Vercel.",
      );
    }
    client = neon(url);
  }
  return client;
}

/** One row as returned by a query. */
export type Row = Awaited<ReturnType<NeonQueryFunction<false, false>>>[number];
