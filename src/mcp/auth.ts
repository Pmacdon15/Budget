import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { touchApiKey } from "@/db/api-keys";
import { hashApiKey, looksLikeApiKey } from "@/lib/api-key-token";
import {
  audienceList,
  oauthTokenRejection,
  type VerifiedOAuthToken,
} from "@/mcp/oauth-token-policy";

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
 * Document, or created in the Clerk dashboard. Then checks it was issued for
 * this MCP server (its audience) and, when `MCP_OAUTH_CLIENT_IDS` is set, by
 * one of those clients; see src/mcp/oauth-token-policy.ts.
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
  const verified = token.startsWith(OPAQUE_TOKEN_PREFIX)
    ? await verifyOpaqueToken(client, token)
    : await verifyJwtToken(client, req, token);
  if (!verified) return undefined;

  const rejection = oauthTokenRejection(verified, req);
  if (rejection) {
    console.warn(`MCP: an OAuth access token was refused: ${rejection}`);
    return undefined;
  }
  return {
    token,
    clientId: verified.clientId || "oauth",
    scopes: verified.scopes,
    extra: { userId: verified.userId, via: "oauth", verifiedBy: "clerk" },
  };
}

const OPAQUE_TOKEN_PREFIX = "oat_";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

/**
 * An opaque token, verified by Clerk's Backend API: the same call
 * `authenticateRequest` makes for it, which also returns the token's audience.
 */
async function verifyOpaqueToken(
  client: Clerk,
  token: string,
): Promise<VerifiedOAuthToken | undefined> {
  let result: Awaited<ReturnType<Clerk["idPOAuthAccessToken"]["verify"]>>;
  try {
    result = await client.idPOAuthAccessToken.verify(token);
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (typeof status !== "number") throw error;
    console.warn(
      `MCP: Clerk rejected an OAuth access token (status ${status})`,
    );
    return undefined;
  }
  if (result.revoked || result.expired) {
    console.warn(
      `MCP: Clerk reports the OAuth access token as ${result.revoked ? "revoked" : "expired"}`,
    );
    return undefined;
  }
  if (!result.subject?.startsWith("user_")) {
    console.warn("MCP: an OAuth access token without a user was rejected");
    return undefined;
  }
  return {
    userId: result.subject,
    clientId: result.clientId,
    scopes: result.scopes ?? [],
    audiences: audienceList(result.aud),
  };
}

/** A JWT access token, whose signature Clerk checks with the instance's keys. */
async function verifyJwtToken(
  client: Clerk,
  req: Request,
  token: string,
): Promise<VerifiedOAuthToken | undefined> {
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
    userId: auth.userId,
    clientId: auth.clientId ?? "",
    scopes: auth.scopes ?? [],
    // Clerk verified the signature above; `toAuth()` leaves out `aud`.
    audiences: audienceList(jwtPayload(token)?.aud),
  };
}

/** The payload of a JWT, decoded but not verified. */
function jwtPayload(token: string): Record<string, unknown> | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
