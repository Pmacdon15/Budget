/** Who Clerk's mocked `auth()` reports as signed in. `null` means signed out. */
export const authState: { userId: string | null } = { userId: "user_a" };

export function signInAs(userId: string) {
  authState.userId = userId;
}

export function signOut() {
  authState.userId = null;
}

/**
 * The mocked Clerk OAuth token check. Tokens in `tokens` are accepted for
 * their user; anything else is rejected the way Clerk rejects it. JWTs go
 * through `authenticateRequest` (kept in `requests`, so tests can check how
 * the token was passed on), opaque `oat_` tokens through the Backend API's
 * `idPOAuthAccessToken.verify`. `seen` has every token handed to Clerk.
 */
type MockOAuthToken = {
  userId: string;
  clientId: string;
  /** The token's audience, as Clerk's Backend API reports it. */
  aud?: string[];
  revoked?: boolean;
};

export const clerkOAuth = {
  tokens: new Map<string, MockOAuthToken>(),
  requests: [] as Request[],
  seen: [] as string[],
  authenticate(request: Request) {
    clerkOAuth.requests.push(request);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (token) clerkOAuth.seen.push(token);
    const known = token ? clerkOAuth.tokens.get(token) : undefined;
    return {
      reason: known ? null : "token-invalid",
      message: known ? null : "OAuth token not found",
      toAuth: () =>
        known
          ? {
              isAuthenticated: true,
              tokenType: "oauth_token",
              userId: known.userId,
              clientId: known.clientId,
              scopes: ["profile", "email"],
            }
          : { isAuthenticated: false, tokenType: "oauth_token" },
    };
  },
  verify(token: string) {
    clerkOAuth.seen.push(token);
    const known = clerkOAuth.tokens.get(token);
    if (!known) {
      throw Object.assign(new Error("OAuth token not found"), { status: 404 });
    }
    return {
      id: "oat_id",
      clientId: known.clientId,
      type: "oauth_token",
      subject: known.userId,
      scopes: ["profile", "email"],
      revoked: known.revoked ?? false,
      revocationReason: null,
      expired: false,
      expiration: null,
      createdAt: 0,
      updatedAt: 0,
      aud: known.aud,
    };
  },
  reset() {
    clerkOAuth.tokens.clear();
    clerkOAuth.requests = [];
    clerkOAuth.seen = [];
  },
};

/** What the mocked `redirect()` throws, so tests can assert on it. */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`Redirected to ${url}`);
    this.name = "RedirectError";
  }
}
