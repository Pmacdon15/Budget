import { describe, expect, it } from "vitest";
import {
  createFixedItem,
  stopFixedItem,
  updateFixedItem,
} from "@/actions/fixed-items";
import { getFixedItems } from "@/dal/fixed-items";
import { getMonthOverview } from "@/dal/overview";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const form = (overrides: Record<string, string> = {}) => ({
  name: "Rent",
  category: "Housing",
  amount: "1500",
  dueDay: "1",
  month: "2026-01",
  ...overrides,
});
const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

async function createRent() {
  expect(await createFixedItem(form())).toEqual({ ok: true });
  const [item] = await getFixedItems();
  if (!item) throw new Error("rent was not created");
  return item;
}

const fixedFor = async (month: string) =>
  (await getMonthOverview(month, 1)).current.fixedCents;

describe("fixed bill actions", () => {
  it("creates a bill that repeats from its start month", async () => {
    const rent = await createRent();
    expect(rent).toMatchObject({
      name: "Rent",
      amountCents: 150_000,
      dueDay: 1,
      startMonth: "2026-01",
      endMonth: null,
    });
    expect(await fixedFor("2025-12")).toBe(0);
    expect(await fixedFor("2026-01")).toBe(150_000);
    expect(await fixedFor("2027-06")).toBe(150_000);
  });

  it("edits in place when editing from the bill's start month", async () => {
    const rent = await createRent();
    expect(
      await updateFixedItem(rent.id, form({ amount: "1600", dueDay: "" })),
    ).toEqual({ ok: true });
    expect(await getFixedItems()).toEqual([
      { ...rent, amountCents: 160_000, dueDay: null },
    ]);
  });

  it("keeps history when editing a later month: past months keep the old amount", async () => {
    const rent = await createRent();
    expect(
      await updateFixedItem(rent.id, form({ amount: "1650", month: "2026-10" })),
    ).toEqual({ ok: true });

    const items = await getFixedItems();
    expect(items).toHaveLength(2);
    expect(await fixedFor("2026-09")).toBe(150_000);
    expect(await fixedFor("2026-10")).toBe(165_000);
    expect(await fixedFor("2027-03")).toBe(165_000);
  });

  it("carries a bill's end month over to its replacement", async () => {
    const rent = await createRent();
    await stopFixedItem(rent.id, "2026-07"); // ends 2026-06
    await updateFixedItem(rent.id, form({ amount: "1700", month: "2026-03" }));
    expect(await fixedFor("2026-02")).toBe(150_000);
    expect(await fixedFor("2026-05")).toBe(170_000);
    expect(await fixedFor("2026-06")).toBe(170_000);
    expect(await fixedFor("2026-07")).toBe(0);
  });

  it("stops a bill from a month, keeping earlier months", async () => {
    const rent = await createRent();
    expect(await stopFixedItem(rent.id, "2026-05")).toEqual({ ok: true });
    expect(await getFixedItems()).toEqual([{ ...rent, endMonth: "2026-04" }]);
    expect(await fixedFor("2026-04")).toBe(150_000);
    expect(await fixedFor("2026-05")).toBe(0);
  });

  it("deletes a bill outright when stopped in the month it started", async () => {
    const rent = await createRent();
    expect(await stopFixedItem(rent.id, "2026-01")).toEqual({ ok: true });
    expect(await getFixedItems()).toEqual([]);
  });

  it("validates input and ids", async () => {
    expect(await createFixedItem(form({ dueDay: "45" }))).toMatchObject({
      ok: false,
      fieldErrors: { dueDay: ["Due day must be between 1 and 31"] },
    });
    expect(await stopFixedItem("nope", "2026-01")).toMatchObject({
      ok: false,
      error: "Invalid id",
    });
    expect(await stopFixedItem(MISSING_ID, "bad month")).toMatchObject({
      ok: false,
      error: "Invalid month",
    });
    expect(await rows("select * from fixed_items")).toEqual([]);
  });

  it("reports missing bills", async () => {
    expect(await updateFixedItem(MISSING_ID, form())).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });
    expect(await stopFixedItem(MISSING_ID, "2026-01")).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });
  });

  it("can't touch another user's bill", async () => {
    const rent = await createRent();
    signInAs("user_b");
    expect(await updateFixedItem(rent.id, form({ amount: "1" }))).toMatchObject({
      ok: false,
    });
    expect(await stopFixedItem(rent.id, "2026-01")).toMatchObject({ ok: false });
    signInAs("user_a");
    expect(await getFixedItems()).toEqual([rent]);
  });

  it("refuses to write when signed out", async () => {
    signOut();
    expect(await createFixedItem(form())).toMatchObject({ ok: false });
    expect(await rows("select * from fixed_items")).toEqual([]);
  });
});
