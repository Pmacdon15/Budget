/*
 * The OAuth settings MCP clients are told about, kept free of server-only
 * imports so the Connect AI card can show them too.
 */

/**
 * The scopes an MCP client should ask Clerk for. Budget only needs to know who
 * signed in (the token's user), so nothing beyond Clerk's basic profile, plus
 * `offline_access` so the client gets a refresh token and stays linked. Google
 * account linking (Gemini) needs that refresh token; Claude and ChatGPT use it
 * too. All three are built-in Clerk scopes, so any client Clerk registers
 * (dynamically, by metadata document, or in the dashboard) can be granted them.
 */
export const MCP_SCOPES = ["profile", "email", "offline_access"] as const;

const CLERK_HOST_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** The Clerk Frontend API URL (the OAuth issuer) encoded in a publishable key. */
export function clerkIssuer(publishableKey: string): string | null {
  if (!/^pk_(test|live)_/.test(publishableKey)) return null;
  try {
    const encoded = publishableKey
      .replace(/^pk_(test|live)_/, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const host = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))
      .replace(/\$$/, "")
      .trim();
    if (!CLERK_HOST_PATTERN.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

export function configuredIssuer() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return publishableKey ? clerkIssuer(publishableKey) : null;
}
