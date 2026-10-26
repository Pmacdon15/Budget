import "server-only";
import { verifyClerkToken } from "@clerk/mcp-tools/server";
import { auth } from "@clerk/nextjs/server";
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
  _req: Request,
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

  const session = await auth({ acceptsToken: "oauth_token" });
  return verifyClerkToken(session, token);
}
