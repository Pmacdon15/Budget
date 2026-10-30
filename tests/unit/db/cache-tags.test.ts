import { describe, expect, it } from "vitest";
import { userDataTag } from "@/db/cache-tags";

/*
 * Cache tags are stored in plain text and are the only thing standing between
 * one user's cached rows and another's, so the format is worth pinning down.
 */

describe("userDataTag", () => {
  it("namespaces the tag by user", () => {
    expect(userDataTag("user_a")).toBe("user-data:user_a");
  });

  it("gives different users different tags", () => {
    expect(userDataTag("user_a")).not.toBe(userDataTag("user_b"));
  });

  it("stays inside the 256-character limit for a Clerk id", () => {
    // Clerk ids are ~32 chars; cacheTag silently skips anything over 256.
    expect(userDataTag(`user_${"x".repeat(40)}`).length).toBeLessThan(256);
  });
});
