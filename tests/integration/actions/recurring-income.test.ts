import { describe, expect, it } from "vitest";
import { deleteIncome } from "@/actions/income";
import {
  createRecurringIncome,
  recordRecurringIncome,
  skipRecurringIncome,
  stopRecurringIncome,
  unskipRecurringIncome,
  updateRecurringIncome,
} from "@/actions/recurring-income";
import { getMonthOverview } from "@/dal/overview";
import { getRecurringIncomeForMonth } from "@/dal/recurring-income";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

async function startPaycheque(month = "2026-03", amount = "2500") {
  expect(
    await createRecurringIncome({ label: "Paycheque", amount, month }),
  ).toEqual({ ok: true });
  const [item] = await getRecurringIncomeForMonth(month);
  if (!item) throw new Error("repeating take-home was not created");
  return item;
}

const statusIn = async (month: string) =>
  (await getRecurringIncomeForMonth(month)).map((i) => i.status);

const takeHomeIn = async (month: string) =>
  (await getMonthOverview(month, 1)).current.incomeCents;

const add = (recurringId: string, month: string, amount = "2500") =>
  recordRecurringIncome({ recurringId, month, amount, receivedOn: "" });

describe("repeating take-home", () => {
  it("is expected from its start month but counts nothing on its own", async () => {
    await startPaycheque("2026-03");
    expect(await statusIn("2026-02")).toEqual([]);
    expect(await statusIn("2026-03")).toEqual([{ state: "expected" }]);
    expect(await statusIn("2027-01")).toEqual([{ state: "expected" }]);
    expect(await takeHomeIn("2026-03")).toBe(0);
  });

  it("adds the usual amount, or a different one, as real take-home", async () => {
    const pay = await startPaycheque();
    expect(await add(pay.id, "2026-03")).toEqual({ ok: true });
    expect(
      await recordRecurringIncome({
        recurringId: pay.id,
        month: "2026-04",
        amount: "2310.45",
        receivedOn: "2026-04-15",
      }),
    ).toEqual({ ok: true });

    expect(await statusIn("2026-03")).toEqual([
      { state: "added", amountCents: 250_000 },
    ]);
    expect(await statusIn("2026-04")).toEqual([
      { state: "added", amountCents: 231_045 },
    ]);
    expect(await takeHomeIn("2026-03")).toBe(250_000);
    expect(await takeHomeIn("2026-04")).toBe(231_045);
    const [april] = (await getMonthOverview("2026-04", 1)).income;
    expect(april).toMatchObject({
      label: "Paycheque",
      receivedOn: "2026-04-15",
    });
  });

  it("won't add the same month twice", async () => {
    const pay = await startPaycheque();
    await add(pay.id, "2026-03");
    expect(await add(pay.id, "2026-03", "100")).toMatchObject({ ok: false });
    expect(await takeHomeIn("2026-03")).toBe(250_000);
  });

  it("can be expected again after its deposit is deleted", async () => {
    const pay = await startPaycheque();
    await add(pay.id, "2026-03");
    const [deposit] = (await getMonthOverview("2026-03", 1)).income;
    if (!deposit) throw new Error("no deposit");
    expect(await deleteIncome(deposit.id)).toEqual({ ok: true });
    expect(await statusIn("2026-03")).toEqual([{ state: "expected" }]);
  });

  it("skips a month and undoes the skip", async () => {
    const pay = await startPaycheque();
    expect(
      await skipRecurringIncome({ recurringId: pay.id, month: "2026-05" }),
    ).toEqual({ ok: true });
    expect(await statusIn("2026-05")).toEqual([{ state: "skipped" }]);
    expect(await statusIn("2026-06")).toEqual([{ state: "expected" }]);

    expect(
      await unskipRecurringIncome({ recurringId: pay.id, month: "2026-05" }),
    ).toEqual({ ok: true });
    expect(await statusIn("2026-05")).toEqual([{ state: "expected" }]);
  });

  it("clears a skip when that month's deposit is added after all", async () => {
    const pay = await startPaycheque();
    await skipRecurringIncome({ recurringId: pay.id, month: "2026-05" });
    expect(await add(pay.id, "2026-05", "1200")).toEqual({ ok: true });
    expect(await statusIn("2026-05")).toEqual([
      { state: "added", amountCents: 120_000 },
    ]);
    expect(await rows("select * from recurring_income_skips")).toEqual([]);
  });

  it("changes the usual amount without touching deposits already added", async () => {
    const pay = await startPaycheque();
    await add(pay.id, "2026-03");
    expect(
      await updateRecurringIncome(pay.id, {
        label: "Day job",
        amount: "2700",
        month: "2026-04",
      }),
    ).toEqual({ ok: true });

    const [april] = await getRecurringIncomeForMonth("2026-04");
    expect(april).toMatchObject({
      label: "Day job",
      amountCents: 270_000,
      startMonth: "2026-03",
    });
    expect(await takeHomeIn("2026-03")).toBe(250_000);
  });

  it("stops from a month on and keeps what was already added", async () => {
    const pay = await startPaycheque();
    await add(pay.id, "2026-03");
    expect(await stopRecurringIncome(pay.id, "2026-06")).toEqual({ ok: true });

    expect(await statusIn("2026-05")).toEqual([{ state: "expected" }]);
    expect(await statusIn("2026-06")).toEqual([]);
    expect(await takeHomeIn("2026-03")).toBe(250_000);
    // Adding a month it no longer covers is refused.
    expect(await add(pay.id, "2026-07")).toMatchObject({ ok: false });
  });

  it("is removed when stopped from its start month, leaving deposits as plain take-home", async () => {
    const pay = await startPaycheque();
    await add(pay.id, "2026-03");
    expect(await stopRecurringIncome(pay.id, "2026-03")).toEqual({ ok: true });
    expect(await rows("select * from recurring_income")).toEqual([]);
    expect(await takeHomeIn("2026-03")).toBe(250_000);
  });

  it("validates amounts on the server", async () => {
    expect(
      await createRecurringIncome({
        label: "Paycheque",
        amount: "lots",
        month: "2026-03",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(Array) } });
    const pay = await startPaycheque();
    expect(await add(pay.id, "2026-03", "-5")).toMatchObject({ ok: false });
    expect(await rows("select * from income")).toEqual([]);
  });

  it("keeps each user's repeating take-home to themselves", async () => {
    const pay = await startPaycheque();
    signInAs("user_b");
    expect(await statusIn("2026-03")).toEqual([]);
    expect(await add(pay.id, "2026-03")).toMatchObject({ ok: false });
    expect(
      await skipRecurringIncome({ recurringId: pay.id, month: "2026-03" }),
    ).toMatchObject({ ok: false });
    expect(await stopRecurringIncome(pay.id, "2026-03")).toMatchObject({
      ok: false,
    });
    expect(
      await updateRecurringIncome(pay.id, {
        label: "Mine now",
        amount: "1",
        month: "2026-03",
      }),
    ).toMatchObject({ ok: false });

    signInAs("user_a");
    expect(await getRecurringIncomeForMonth("2026-03")).toMatchObject([
      { label: "Paycheque", status: { state: "expected" } },
    ]);
    expect(await rows("select * from income")).toEqual([]);
  });

  it("reports a missing one as not found", async () => {
    expect(await add(MISSING_ID, "2026-03")).toMatchObject({ ok: false });
  });

  it("needs a signed-in user", async () => {
    signOut();
    expect(
      await createRecurringIncome({
        label: "Paycheque",
        amount: "2500",
        month: "2026-03",
      }),
    ).toMatchObject({ ok: false });
    expect(await rows("select * from recurring_income")).toEqual([]);
  });
});
