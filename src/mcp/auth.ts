import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { touchApiKey } from "@/db/api-keys";
import { hashApiKey, looksLikeApiKey } from "@/lib/api-key-token";

/*
 * Who is calling the MCP server. Two ways in:
 *
 * - OAuth (the normal way): the AI app sends the user to sign in to Budget
 *   with Clerk, and Clerk issues it an access token. Clerk verifies the token.
 * - A personal API key (`bgt_...`), for apps that can't do OAuth. Its hash is
 *   looked up; revoked keys don't work.
 *
 * Either way the result carries the Budget user id in `extra.userId`, which is
 * the only place tools take the user from.
 */
export async function verifyMcpToken(
  req: Request,
  token: string | undefined,
): Promise<AuthInfo | undefined> {
  if (!token) return undefined;

  if (looksLikeApiKey(token)) {
    const key = await touchApiKey(hashApiKey(token));
    if (!key) return undefined;
    return {
      token,
      clientId: `api-key:${key.id}`,
      scopes: [],
      extra: { userId: key.userId, client: key.name, via: "api_key" },
    };
  }

  return verifyOAuthToken(req, token);
}

/**
 * Asks Clerk about an OAuth access token, opaque (`oat_...`) or JWT, from any
 * client of this Clerk instance: registered dynamically, by Client ID Metadata
 * Document, or created in the Clerk dashboard.
 *
 * The token is handed to Clerk directly, in a request of its own, instead of
 * through `auth()`: that reads the Authorization header as the middleware saw
 * it, which only recognizes the exact spelling "Bearer ", so a client that
 * writes "bearer" was turned away with a token Clerk would have accepted.
 */
async function verifyOAuthToken(
  req: Request,
  token: string,
): Promise<AuthInfo | undefined> {
  const client = await clerkClient();
  const state = await client.authenticateRequest(
    new Request(req.url, { headers: { authorization: `Bearer ${token}` } }),
    { acceptsToken: "oauth_token" },
  );
  const auth = state.toAuth();
  if (!auth?.isAuthenticated || auth.tokenType !== "oauth_token") {
    console.warn(
      `MCP: Clerk rejected an OAuth access token (${state.reason ?? "no reason given"}${state.message ? `: ${state.message}` : ""})`,
    );
    return undefined;
  }
  if (!auth.userId) {
    console.warn("MCP: an OAuth access token without a user was rejected");
    return undefined;
  }
  return {
    token,
    clientId: auth.clientId ?? "oauth",
    scopes: auth.scopes ?? [],
    extra: { userId: auth.userId, via: "oauth", verifiedBy: "clerk" },
  };
}
