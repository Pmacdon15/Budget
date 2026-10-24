import { describe, expect, it } from "vitest";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { UnauthorizedError } from "@/dal/errors";
import { getFixedItems } from "@/dal/fixed-items";
import { getLatestIncome } from "@/dal/income";
import { getMonthOverview } from "@/dal/overview";
import { RedirectError, signInAs, signOut } from "../../helpers/auth";

describe("auth guards", () => {
  it("returns the signed-in user's id", async () => {
    signInAs("user_42");
    expect(await requireUserId()).toBe("user_42");
    expect(await currentUserIdOrThrow()).toBe("user_42");
  });

  it("sends signed-out visitors to sign-in on reads", async () => {
    signOut();
    await expect(requireUserId()).rejects.toMatchObject({
      name: "RedirectError",
      url: "/sign-in",
    });
  });

  it("throws for signed-out writes so the action can explain", async () => {
    signOut();
    await expect(currentUserIdOrThrow()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it.each([
    ["getMonthOverview", () => getMonthOverview("2026-10")],
    ["getFixedItems", () => getFixedItems()],
    ["getLatestIncome", () => getLatestIncome()],
  ])("%s requires sign-in", async (_name, read) => {
    signOut();
    await expect(read()).rejects.toBeInstanceOf(RedirectError);
  });
});
