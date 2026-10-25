import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUpcomingBills } from "@/dal/upcoming-bills";
import { insertFixedItem } from "@/db/fixed-items";
import { signInAs } from "../../helpers/auth";

const addBill = (name: string, dueDay: number | null, userId = "user_a") =>
  insertFixedItem(userId, {
    name,
    category: "Housing",
    amountCents: 10_000,
    dueDay,
    startMonth: "2026-01",
  });

describe("getUpcomingBills", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:00 on Oct 29 in Regina (UTC-6).
    vi.setSystemTime(new Date("2026-10-29T07:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("lists the signed-in user's bills due in the next 7 days", async () => {
    await addBill("Rent", 1);
    await addBill("Insurance", 30);
    await addBill("Phone", 15);
    await addBill("No date", null);
    await addBill("Someone else's", 30, "user_b");

    const bills = await getUpcomingBills();
    expect(bills.map((b) => [b.name, b.dueOn, b.daysAway])).toEqual([
      ["Insurance", "2026-10-30", 1],
      ["Rent", "2026-11-01", 3],
    ]);
  });

  it("counts today in the app's time zone", async () => {
    // 03:00 UTC on the 29th is still the evening of the 28th in Regina.
    vi.setSystemTime(new Date("2026-10-29T03:00:00Z"));
    await addBill("Insurance", 28);
    const [bill] = await getUpcomingBills();
    expect(bill).toMatchObject({ dueOn: "2026-10-28", daysAway: 0 });
  });

  it("is empty for another user", async () => {
    await addBill("Rent", 30);
    signInAs("user_b");
    expect(await getUpcomingBills()).toEqual([]);
  });
});
