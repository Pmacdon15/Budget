import { mcpResourceUrl, publicOrigin } from "@/mcp/http";

/*
 * What Budget requires of an OAuth access token once Clerk has said it's
 * genuine. Clerk accepts a token from any OAuth client of this Clerk
 * instance; these checks make sure it was also issued for Budget's MCP
 * server, so a token another app got from the same Clerk instance can't be
 * replayed here.
 *
 * - Audience (RFC 8707 / RFC 9068): when the token names the resource it was
 *   issued for (`aud`), that has to be this MCP server. A token whose only
 *   audience is its own client id names no resource, and is treated like a
 *   token without one: MCP clients that don't send a resource indicator still
 *   work. A token without `aud` isn't rejected for it, because Clerk doesn't
 *   always set one.
 * - Clients: when `MCP_OAUTH_CLIENT_IDS` is set (comma-separated client ids),
 *   only those clients' tokens are accepted. Unset, any client of the Clerk
 *   instance is, which Claude, ChatGPT and Gemini need: they register
 *   themselves dynamically, each with a client id of its own.
 */

/** A token Clerk verified, with the fields Budget checks. */
export type VerifiedOAuthToken = {
  userId: string;
  clientId: string;
  scopes: string[];
  /** The token's `aud`, normalized to a list (empty when it has none). */
  audiences: string[];
};

/** The client ids in `MCP_OAUTH_CLIENT_IDS` (its value), or null when it isn't set. */
export function allowedOAuthClientIds(
  value: string | undefined,
): Set<string> | null {
  const ids = (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * The audiences that name this MCP server: the `resource` its protected
 * resource metadata advertises (the production URL in production), and the
 * bare origin, which some authorization servers put in `aud` instead.
 */
export function acceptedAudiences(req: Request): string[] {
  const origin = withoutTrailingSlash(publicOrigin(req));
  return [withoutTrailingSlash(mcpResourceUrl(req)), origin];
}

/** The audiences in a JWT `aud` claim (a string or a list), as a list. */
export function audienceList(aud: unknown): string[] {
  const values = Array.isArray(aud) ? aud : aud === undefined ? [] : [aud];
  return values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

/**
 * Why Budget refuses a token Clerk accepted, or null if it doesn't. The
 * reason is for the logs: it names client ids and audiences, never the token.
 */
export function oauthTokenRejection(
  token: VerifiedOAuthToken,
  req: Request,
  allowedClients = allowedOAuthClientIds(process.env.MCP_OAUTH_CLIENT_IDS),
): string | null {
  if (allowedClients && !allowedClients.has(token.clientId)) {
    return `client ${JSON.stringify(token.clientId)} isn't in MCP_OAUTH_CLIENT_IDS`;
  }
  const resources = token.audiences.filter((aud) => aud !== token.clientId);
  if (resources.length === 0) return null;
  const accepted = new Set(acceptedAudiences(req));
  if (resources.some((aud) => accepted.has(withoutTrailingSlash(aud)))) {
    return null;
  }
  return `audience ${JSON.stringify(resources)} isn't this MCP server (${mcpResourceUrl(req)})`;
}
