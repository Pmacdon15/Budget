import { describe, expect, it, vi } from "vitest";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
import { GET as authServerMetadata } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { GET as openIdConfiguration } from "@/app/.well-known/openid-configuration/[[...path]]/route";
import { DELETE, GET, OPTIONS, POST } from "@/app/api/mcp/route";
import { clerkOAuth, signInAs } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

/*
 * The MCP endpoint over HTTP, the way an AI app calls it: JSON-RPC posted to
 * /api/mcp with a bearer token, answered as a server-sent event (or as plain
 * JSON for a client that only accepts JSON).
 */

const URL_ = "https://budget.patmac.ca/api/mcp";
const METADATA_URL =
  "https://budget.patmac.ca/.well-known/oauth-protected-resource/api/mcp";

function post(
  headers: Record<string, string>,
  body: unknown,
  accept = "application/json, text/event-stream",
) {
  return POST(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept,
        "mcp-protocol-version": "2025-06-18",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function rpc(
  token: string | null,
  method: string,
  params: unknown = {},
  scheme = "Bearer",
) {
  const res = await post(token ? { authorization: `${scheme} ${token}` } : {}, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
  const text = await res.text();
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return {
    status: res.status,
    headers: res.headers,
    challenge: res.headers.get("www-authenticate"),
    text,
    body: data ? JSON.parse(data) : null,
  };
}

async function newKey(name = "Muse") {
  const created = await createApiKey({ name });
  if (!created.ok) throw new Error(created.error);
  return created.key;
}

const initialize = (token: string | null, scheme?: string) =>
  rpc(
    token,
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
    scheme,
  );

const callTool = (token: string, name: string, args: unknown) =>
  rpc(token, "tools/call", { name, arguments: args });

describe("MCP endpoint auth", () => {
  it("answers 401 with a bare challenge pointing to the endpoint's metadata when there's no token", async () => {
    const res = await initialize(null);
    expect(res.status).toBe(401);
    expect(res.challenge).toBe(`Bearer resource_metadata="${METADATA_URL}"`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain(
      "WWW-Authenticate",
    );
  });

  it("challenges GET and DELETE the same way", async () => {
    for (const handler of [GET, DELETE]) {
      const res = await handler(new Request(URL_));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain(METADATA_URL);
    }
  });

  it("marks a rejected token invalid_token, so the client refreshes or signs in again", async () => {
    const res = await initialize("oat_expired");
    expect(res.status).toBe(401);
    expect(res.challenge).toContain('error="invalid_token"');
    expect(res.challenge).toContain(`resource_metadata="${METADATA_URL}"`);
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
    clerkOAuth.tokens.set("oat_from_clerk", {
      userId: "user_oauth",
      clientId: "oauth_client_claude",
    });
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

  it("accepts any spelling of the Bearer scheme and hands Clerk the bare token", async () => {
    clerkOAuth.tokens.set("eyJhbGciOi.jwt.token", {
      userId: "user_oauth",
      clientId: "gemini",
    });
    for (const scheme of ["bearer", "BEARER", "Bearer "]) {
      const res = await initialize("eyJhbGciOi.jwt.token", scheme);
      expect(res.status, scheme).toBe(200);
    }
    expect(
      clerkOAuth.requests.map((r) => r.headers.get("authorization")),
    ).toEqual(Array(3).fill("Bearer eyJhbGciOi.jwt.token"));
  });

  it("rejects an OAuth token Clerk doesn't accept", async () => {
    expect((await initialize("oat_bad")).status).toBe(401);
  });

  it("answers 401, not a crash, when Clerk can't be reached", async () => {
    const { clerkClient } = await import("@clerk/nextjs/server");
    vi.mocked(clerkClient).mockRejectedValueOnce(new Error("network down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await initialize("oat_any");
    expect(res.status).toBe(401);
    expect(res.challenge).toContain('error="invalid_token"');
    expect(spy).toHaveBeenCalled();
  });
});

describe("MCP endpoint transport", () => {
  it("answers a CORS preflight for browser-based clients", async () => {
    const res = await OPTIONS(
      new Request(URL_, {
        method: "OPTIONS",
        headers: {
          origin: "https://gemini.google.com",
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "authorization, content-type, mcp-protocol-version",
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type, mcp-protocol-version",
    );
    expect(res.headers.get("access-control-expose-headers")).toContain(
      "Mcp-Session-Id",
    );
  });

  it("puts CORS headers on MCP answers too", async () => {
    const res = await initialize(await newKey());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers a client that only accepts JSON with plain JSON", async () => {
    const key = await newKey();
    for (const accept of ["application/json", "*/*", ""]) {
      const res = await post(
        { authorization: `Bearer ${key}` },
        { jsonrpc: "2.0", id: 7, method: "tools/list", params: {} },
        accept,
      );
      expect(res.status, accept).toBe(200);
      expect(res.headers.get("content-type"), accept).toBe("application/json");
      const body = await res.json();
      expect(body.id).toBe(7);
      expect(body.result.tools.length).toBeGreaterThan(10);
    }
  });

  it("accepts a notification with 202 and no body for a JSON-only client", async () => {
    const res = await post(
      { authorization: `Bearer ${await newKey()}` },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      "application/json",
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("says GET streams aren't offered (stateless), so clients don't wait on one", async () => {
    const res = await GET(
      new Request(URL_, {
        headers: {
          authorization: `Bearer ${await newKey()}`,
          accept: "text/event-stream",
        },
      }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("doesn't advertise tool list changes, which nothing here sends", async () => {
    const res = await initialize(await newKey());
    expect(res.body.result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("ends a 2026-era subscriptions/listen right away instead of holding it open", async () => {
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "probe", version: "1" },
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    const res = await post(
      {
        authorization: `Bearer ${await newKey()}`,
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "subscriptions/listen",
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "subscriptions/listen",
        params: { notifications: { toolsListChanged: true }, _meta: meta },
      },
    );
    // Reading the whole body only finishes if the server closes the stream.
    const text = await Promise.race([
      res.text(),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still open"), 2_000),
      ),
    ]);
    expect(text).not.toBe("still open");
    expect(text).toContain('"resultType":"complete"');
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
      "add_income",
      "attach_receipt",
      "convert_expense_to_fixed_bill",
      "delete_expense",
      "edit_expense",
      "edit_fixed_bill",
      "find_matching_fixed_bill",
      "list_accounts",
      "list_categories",
      "list_expenses",
      "list_fixed_bills",
      "list_income",
      "mark_bill_paid",
      "mark_expense_paid",
      "propose_account",
      "record_statement",
      "record_transfer",
      "sync_bank_balance",
      "unlink_fixed_bill",
      "update_account_balance",
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
  const PK = `pk_test_${btoa("clerk.budget.example$")}`;

  it.each([
    "https://budget.patmac.ca/.well-known/oauth-protected-resource",
    "https://budget.patmac.ca/.well-known/oauth-protected-resource/api/mcp",
  ])("names this app's Clerk instance as the sign-in server for /api/mcp at %s", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", PK);
    const res = resourceMetadata(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({
      resource: "https://budget.patmac.ca/api/mcp",
      authorization_servers: ["https://clerk.budget.example"],
      bearer_methods_supported: ["header"],
      resource_name: "Budget",
      resource_documentation: "https://budget.patmac.ca/review",
    });
  });

  it("names the resource after the host the client used, e.g. a preview deployment", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", PK);
    const res = resourceMetadata(
      new Request(
        "https://budget-git-fix.vercel.app/.well-known/oauth-protected-resource/api/mcp",
      ),
    );
    expect((await res.json()).resource).toBe(
      "https://budget-git-fix.vercel.app/api/mcp",
    );
  });

  it("says so plainly when Clerk isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    const res = resourceMetadata(
      new Request(
        "https://budget.patmac.ca/.well-known/oauth-protected-resource",
      ),
    );
    expect(res.status).toBe(503);
  });

  it.each([
    ["oauth-authorization-server", authServerMetadata],
    ["openid-configuration", openIdConfiguration],
  ] as const)("copies Clerk's %s document", async (document, handler) => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", PK);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        issuer: "https://clerk.budget.example",
        registration_endpoint: "https://clerk.budget.example/oauth/register",
        client_id_metadata_document_supported: true,
      }),
    );
    const res = await handler();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://clerk.budget.example/.well-known/${document}`,
      expect.anything(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toMatchObject({
      issuer: "https://clerk.budget.example",
      registration_endpoint: "https://clerk.budget.example/oauth/register",
    });
  });

  it("answers 502 when Clerk's metadata can't be fetched", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", PK);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await authServerMetadata()).status).toBe(502);
  });
});
