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
 * their user; anything else is rejected the way Clerk rejects it. `requests`
 * keeps what was asked, so tests can check how the token was passed on.
 */
export const clerkOAuth = {
  tokens: new Map<string, { userId: string; clientId: string }>(),
  requests: [] as Request[],
  authenticate(request: Request) {
    clerkOAuth.requests.push(request);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
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
  reset() {
    clerkOAuth.tokens.clear();
    clerkOAuth.requests = [];
  },
};

/** What the mocked `redirect()` throws, so tests can assert on it. */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`Redirected to ${url}`);
    this.name = "RedirectError";
  }
}
