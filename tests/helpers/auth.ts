/** Who Clerk's mocked `auth()` reports as signed in. `null` means signed out. */
export const authState: { userId: string | null } = { userId: "user_a" };

export function signInAs(userId: string) {
  authState.userId = userId;
}

export function signOut() {
  authState.userId = null;
}

/** What the mocked `redirect()` throws, so tests can assert on it. */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`Redirected to ${url}`);
    this.name = "RedirectError";
  }
}
