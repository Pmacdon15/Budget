import { auth } from "@clerk/nextjs/server";
import { describe, expect, it, vi } from "vitest";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
import { GET as authServerMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { POST } from "@/app/api/mcp/route";
import { signInAs } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

/*
 * The MCP endpoint over HTTP, the way an AI app calls it: JSON-RPC posted to
 * /api/mcp with a bearer token, answered as a server-sent event.
 */

const URL_ = "https://budget.patmac.ca/api/mcp";

async function rpc(token: string | null, method: string, params: unknown = {}) {
  const res = await POST(
    new Request(URL_, {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return {
    status: res.status,
    challenge: res.headers.get("www-authenticate"),
    body: data ? JSON.parse(data) : null,
  };
}

async function newKey(name = "Muse") {
  const created = await createApiKey({ name });
  if (!created.ok) throw new Error(created.error);
  return created.key;
}

const initialize = (token: string | null) =>
  rpc(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });

const callTool = (token: string, name: string, args: unknown) =>
  rpc(token, "tools/call", { name, arguments: args });

describe("MCP endpoint auth", () => {
  it("answers 401 with a pointer to sign-in when there's no token", async () => {
    const res = await initialize(null);
    expect(res.status).toBe(401);
    expect(res.challenge).toContain(
      'resource_metadata="https://budget.patmac.ca/.well-known/oauth-protected-resource"',
    );
  });

  it("rejects a key that doesn't exist", async () => {
    const res = await initialize("bgt_not-a-real-key");
    expect(res.status).toBe(401);
  });

  it("rejects a revoked key", async () => {
    const key = await newKey();
    const [row] = await rows("select id from api_keys");
    await revokeApiKey(String(row?.id));
    expect((await initialize(key)).status).toBe(401);
  });

  it("accepts a Clerk OAuth token for the user who signed in", async () => {
    // The route asks Clerk to verify the token once per request.
    vi.mocked(auth).mockImplementationOnce((async (options?: {
      acceptsToken?: string;
    }) =>
      options?.acceptsToken === "oauth_token"
        ? {
            isAuthenticated: true,
            tokenType: "oauth_token",
            clientId: "oauth_client_claude",
            scopes: ["profile", "email"],
            userId: "user_oauth",
          }
        : { userId: null }) as never);
    const res = await callTool("oat_from_clerk", "add_expense", {
      amount: 12,
      date: "2026-10-20",
      merchant: "Tim Hortons",
      category: "Food",
    });
    expect(res.status).toBe(200);
    expect(res.body.result.structuredContent.status).toBe("pending_review");
    expect(await rows("select user_id from pending_expenses")).toEqual([
      { user_id: "user_oauth" },
    ]);
  });

  it("rejects an OAuth token Clerk doesn't accept", async () => {
    vi.mocked(auth).mockImplementationOnce((async () => ({
      isAuthenticated: false,
      tokenType: "oauth_token",
    })) as never);
    expect((await initialize("oat_bad")).status).toBe(401);
  });
});

describe("MCP endpoint with an API key", () => {
  it("introduces itself with the usage instructions", async () => {
    const res = await initialize(await newKey());
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe("budget");
    expect(res.body.result.instructions).toContain("Pending Review");
  });

  it("lists every tool", async () => {
    const res = await rpc(await newKey(), "tools/list");
    const names = res.body.result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual([
      "add_expense",
      "add_fixed_bill",
      "attach_receipt",
      "convert_expense_to_fixed_bill",
      "delete_expense",
      "edit_expense",
      "edit_fixed_bill",
      "find_matching_fixed_bill",
      "list_categories",
      "list_expenses",
      "list_fixed_bills",
      "mark_bill_paid",
      "mark_expense_paid",
      "sync_bank_balance",
      "unlink_fixed_bill",
    ]);
  });

  it("files what it adds under the key's owner, named after the key", async () => {
    const key = await newKey("Muse");
    signInAs("someone_else");
    await callTool(key, "add_expense", {
      amount: 45.67,
      date: "2026-10-20",
      merchant: "Shell",
      category: "Transportation",
    });
    expect(await rows("select user_id, client from pending_expenses")).toEqual([
      { user_id: "user_a", client: "Muse" },
    ]);
    expect(
      (await rows("select last_used_at from api_keys"))[0]?.last_used_at,
    ).not.toBeNull();
  });

  it("returns invalid input as a tool error the AI can read", async () => {
    const res = await callTool(await newKey(), "add_expense", {
      amount: -3,
      date: "2026-10-20",
      merchant: "Shell",
      category: "Transportation",
    });
    expect(res.status).toBe(200);
    const result = res.body.result ?? res.body.error;
    expect(JSON.stringify(result)).toMatch(/more than zero|Invalid/);
    expect(await rows("select * from pending_expenses")).toHaveLength(0);
  });
});

describe("OAuth discovery", () => {
  it("names this app's Clerk instance as the sign-in server for /api/mcp", async () => {
    const before = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    // pk_test_ + base64("clerk.budget.example$")
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_test_${btoa("clerk.budget.example$")}`;
    try {
      const res = resourceMetadata(
        new Request(
          "https://budget.patmac.ca/.well-known/oauth-protected-resource",
        ),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(await res.json()).toMatchObject({
        resource: "https://budget.patmac.ca/api/mcp",
        authorization_servers: ["https://clerk.budget.example"],
      });
    } finally {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = before;
    }
  });

  it("says so plainly when Clerk isn't configured", async () => {
    const before = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    try {
      const res = resourceMetadata(
        new Request(
          "https://budget.patmac.ca/.well-known/oauth-protected-resource",
        ),
      );
      expect(res.status).toBe(503);
    } finally {
      if (before !== undefined) {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = before;
      }
    }
  });

  it("serves the authorization server metadata handler", () => {
    expect(typeof authServerMetadata).toBe("function");
  });
});
