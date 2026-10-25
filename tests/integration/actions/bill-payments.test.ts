import { describe, expect, it } from "vitest";
import { markBillPaid, unmarkBillPaid } from "@/actions/bill-payments";
import {
  createFixedItem,
  stopFixedItem,
  updateFixedItem,
} from "@/actions/fixed-items";
import { getPaidBillIds } from "@/dal/bill-payments";
import { getFixedItems } from "@/dal/fixed-items";
import { getMonthOverview } from "@/dal/overview";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

async function createRent(month = "2026-01") {
  expect(
    await createFixedItem({
      name: "Rent",
      category: "Housing",
      amount: "1500",
      dueDay: "1",
      month,
    }),
  ).toEqual({ ok: true });
  const [item] = await getFixedItems();
  if (!item) throw new Error("rent was not created");
  return item;
}

const paidIn = async (month: string) => [...(await getPaidBillIds(month))];

describe("marking bills paid", () => {
  it("marks a bill paid for one month only", async () => {
    const rent = await createRent();
    expect(
      await markBillPaid({ fixedItemId: rent.id, month: "2026-03" }),
    ).toEqual({ ok: true });
    expect(await paidIn("2026-03")).toEqual([rent.id]);
    expect(await paidIn("2026-02")).toEqual([]);
    expect(await paidIn("2026-04")).toEqual([]);
  });

  it("is idempotent and can be undone", async () => {
    const rent = await createRent();
    const values = { fixedItemId: rent.id, month: "2026-03" };
    await markBillPaid(values);
    expect(await markBillPaid(values)).toEqual({ ok: true });
    expect(await rows("select * from fixed_item_payments")).toHaveLength(1);
    expect(await unmarkBillPaid(values)).toEqual({ ok: true });
    expect(await paidIn("2026-03")).toEqual([]);
  });

  it("doesn't change the month's costs either way", async () => {
    const rent = await createRent();
    const before = (await getMonthOverview("2026-03", 1)).current;
    await markBillPaid({ fixedItemId: rent.id, month: "2026-03" });
    const after = (await getMonthOverview("2026-03", 1)).current;
    expect(after).toEqual(before);
    expect(after.fixedCents).toBe(150_000);
  });

  it("refuses a month the bill isn't active in", async () => {
    const rent = await createRent("2026-05");
    expect(
      await markBillPaid({ fixedItemId: rent.id, month: "2026-04" }),
    ).toMatchObject({ ok: false });
    expect(await rows("select * from fixed_item_payments")).toHaveLength(0);
  });

  it("rejects bad input", async () => {
    expect(
      await markBillPaid({ fixedItemId: "nope", month: "2026-03" }),
    ).toMatchObject({ ok: false, error: "Invalid id" });
    expect(
      await markBillPaid({ fixedItemId: MISSING_ID, month: "2026-03" }),
    ).toMatchObject({ ok: false });
  });

  it("only touches the signed-in user's bills", async () => {
    signInAs("user_a");
    const rent = await createRent();
    await markBillPaid({ fixedItemId: rent.id, month: "2026-03" });

    signInAs("user_b");
    expect(
      await markBillPaid({ fixedItemId: rent.id, month: "2026-04" }),
    ).toMatchObject({ ok: false });
    expect(
      await unmarkBillPaid({ fixedItemId: rent.id, month: "2026-03" }),
    ).toMatchObject({ ok: false });
    expect(await paidIn("2026-03")).toEqual([]);

    signInAs("user_a");
    expect(await paidIn("2026-03")).toEqual([rent.id]);
    expect(await paidIn("2026-04")).toEqual([]);
  });

  it("requires sign-in", async () => {
    signOut();
    expect(
      await markBillPaid({ fixedItemId: MISSING_ID, month: "2026-03" }),
    ).toMatchObject({ ok: false });
  });

  it("keeps paid months with the bill when its amount is edited", async () => {
    const rent = await createRent();
    await markBillPaid({ fixedItemId: rent.id, month: "2026-02" });
    await markBillPaid({ fixedItemId: rent.id, month: "2026-03" });
    await markBillPaid({ fixedItemId: rent.id, month: "2026-04" });

    expect(
      await updateFixedItem(rent.id, {
        name: "Rent",
        category: "Housing",
        amount: "1600",
        dueDay: "1",
        month: "2026-03",
      }),
    ).toEqual({ ok: true });
    const replacement = (await getFixedItems()).find(
      (item) => item.startMonth === "2026-03",
    );
    if (!replacement) throw new Error("edit didn't split the bill");

    expect(await paidIn("2026-02")).toEqual([rent.id]);
    expect(await paidIn("2026-03")).toEqual([replacement.id]);
    expect(await paidIn("2026-04")).toEqual([replacement.id]);
  });

  it("goes away with a deleted bill", async () => {
    const rent = await createRent("2026-03");
    await markBillPaid({ fixedItemId: rent.id, month: "2026-03" });
    await stopFixedItem(rent.id, "2026-03");
    expect(await rows("select * from fixed_item_payments")).toHaveLength(0);
  });
});
