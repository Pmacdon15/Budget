import { revalidateTag, updateTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { createApiKey } from "@/actions/api-keys";
import { POST } from "@/app/api/mcp/route";
import { userDataTag } from "@/db/cache-tags";

/*
 * An AI app writing through the MCP endpoint has to clear the same cached
 * reads a write from the web UI does, or the dashboard keeps serving its own
 * cached copy until the `cacheLife` window passes. The endpoint is a route
 * handler, so it's `revalidateTag` here and not `updateTag`, which Next only
 * allows inside a Server Action.
 *
 * Read-only tools opt out, so an AI listing expenses doesn't throw away the
 * cache it just filled.
 */

const URL_ = "https://budget.patmac.ca/api/mcp";

async function newKey(name = "Muse") {
  const created = await createApiKey({ name });
  if (!created.ok) throw new Error(created.error);
  // Creating the key is itself a mutation; forget its invalidation.
  vi.mocked(updateTag).mockClear();
  vi.mocked(revalidateTag).mockClear();
  return created.key;
}

async function callTool(token: string, name: string, args: unknown) {
  const res = await POST(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "mcp-protocol-version": "2025-06-18",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

describe("MCP cache invalidation", () => {
  it("clears the caller's cached reads after a tool that writes", async () => {
    const key = await newKey();

    const res = await callTool(key, "add_expense", {
      amount: 123.45,
      date: "2026-10-05",
      merchant: "Costco",
      category: "Groceries",
    });

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(userDataTag("user_a"), {
      expire: 0,
    });
    // A route handler may not use `updateTag`; calling it there throws.
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("leaves the cache in place for a read-only tool", async () => {
    const key = await newKey();

    const res = await callTool(key, "list_expenses", {
      from: "2026-10-01",
      to: "2026-10-31",
    });

    expect(res.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("doesn't clear anything when the token is refused", async () => {
    const res = await callTool("oat_not_a_real_key", "add_expense", {
      amount: 123.45,
      date: "2026-10-05",
      merchant: "Costco",
      category: "Groceries",
    });

    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
