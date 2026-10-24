import { describe, expect, it } from "vitest";
import {
  isOwnReceiptImagePathname,
  newReceiptImagePathname,
} from "@/lib/receipt-image";

describe("receipt photo pathnames", () => {
  it("mints a pathname inside the user's folder", () => {
    const pathname = newReceiptImagePathname("user_abc");
    expect(pathname).toMatch(/^receipts\/user_abc\/[0-9a-f-]{36}\.jpg$/);
    expect(isOwnReceiptImagePathname(pathname, "user_abc")).toBe(true);
  });

  it("refuses an id that could move the folder boundary", () => {
    expect(() => newReceiptImagePathname("user/abc")).toThrow();
    expect(() => newReceiptImagePathname("")).toThrow();
  });

  it("only accepts the caller's own, exactly-shaped pathnames", () => {
    const own = newReceiptImagePathname("user_a");
    expect(isOwnReceiptImagePathname(own, "user_b")).toBe(false);
    expect(
      isOwnReceiptImagePathname(own.replace("user_a", "user_ab"), "user_a"),
    ).toBe(false);
    expect(
      isOwnReceiptImagePathname("receipts/user_a/../user_b/x.jpg", "user_a"),
    ).toBe(false);
    expect(isOwnReceiptImagePathname(`${own}?x=1`, "user_a")).toBe(false);
    expect(
      isOwnReceiptImagePathname(own.replace(".jpg", ".png"), "user_a"),
    ).toBe(false);
    expect(isOwnReceiptImagePathname(42, "user_a")).toBe(false);
    expect(isOwnReceiptImagePathname(own, "user/a")).toBe(false);
  });
});
