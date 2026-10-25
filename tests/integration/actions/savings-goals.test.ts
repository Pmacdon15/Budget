import { describe, expect, it } from "vitest";
import { deleteExpense } from "@/actions/expenses";
import {
  contributeToGoal,
  createSavingsGoal,
  deleteSavingsGoal,
  updateSavingsGoal,
} from "@/actions/savings-goals";
import { getMonthOverview } from "@/dal/overview";
import { getSavingsGoals } from "@/dal/savings-goals";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

async function addTrip() {
  expect(
    await createSavingsGoal({
      name: "Trip",
      target: "1200",
      targetDate: "2026-12-31",
      month: "2026-01",
    }),
  ).toEqual({ ok: true });
  const [goal] = await getSavingsGoals();
  if (!goal) throw new Error("goal was not created");
  return goal;
}

const give = (goalId: string, amount: string, spentOn = "2026-10-03") =>
  contributeToGoal({ goalId, amount, spentOn });

describe("savings goal actions", () => {
  it("creates a goal with nothing saved yet", async () => {
    expect(await addTrip()).toMatchObject({
      name: "Trip",
      targetCents: 120_000,
      targetDate: "2026-12-31",
      startMonth: "2026-01",
      savedCents: 0,
    });
  });

  it("adds money as Savings spending linked to the goal", async () => {
    const trip = await addTrip();
    expect(await give(trip.id, "150")).toEqual({ ok: true });
    expect(await give(trip.id, "50.25", "2026-11-02")).toEqual({ ok: true });

    const [updated] = await getSavingsGoals();
    expect(updated?.savedCents).toBe(20_025);

    const october = await getMonthOverview("2026-10", 1);
    expect(october.expenses).toMatchObject([
      {
        description: "Saved for Trip",
        category: "Savings",
        amountCents: 15_000,
        spentOn: "2026-10-03",
      },
    ]);
    expect(october.current.variableCents).toBe(15_000);
  });

  it("stops counting money whose expense is deleted", async () => {
    const trip = await addTrip();
    await give(trip.id, "150");
    const [expense] = (await getMonthOverview("2026-10", 1)).expenses;
    if (!expense) throw new Error("no expense");
    expect(await deleteExpense(expense.id)).toEqual({ ok: true });
    expect((await getSavingsGoals())[0]?.savedCents).toBe(0);
  });

  it("edits a goal and keeps what was saved", async () => {
    const trip = await addTrip();
    await give(trip.id, "150");
    expect(
      await updateSavingsGoal(trip.id, {
        name: "Japan trip",
        target: "3000",
        targetDate: "",
        month: "2026-01",
      }),
    ).toEqual({ ok: true });
    expect(await getSavingsGoals()).toMatchObject([
      {
        name: "Japan trip",
        targetCents: 300_000,
        targetDate: null,
        savedCents: 15_000,
      },
    ]);
  });

  it("deletes a goal but keeps the money as Savings spending", async () => {
    const trip = await addTrip();
    await give(trip.id, "150");
    expect(await deleteSavingsGoal(trip.id)).toEqual({ ok: true });
    expect(await getSavingsGoals()).toEqual([]);
    expect(await rows("select category, goal_id from expenses")).toEqual([
      { category: "Savings", goal_id: null },
    ]);
  });

  it("validates input on the server", async () => {
    expect(
      await createSavingsGoal({ name: "", target: "abc", month: "2026-01" }),
    ).toMatchObject({ ok: false });
    const trip = await addTrip();
    expect(await give(trip.id, "0")).toMatchObject({ ok: false });
    expect(await rows("select * from expenses")).toEqual([]);
  });

  it("keeps each user's goals to themselves", async () => {
    const trip = await addTrip();
    signInAs("user_b");
    expect(await getSavingsGoals()).toEqual([]);
    expect(await give(trip.id, "150")).toMatchObject({ ok: false });
    expect(
      await updateSavingsGoal(trip.id, {
        name: "Mine",
        target: "1",
        month: "2026-01",
      }),
    ).toMatchObject({ ok: false });
    expect(await deleteSavingsGoal(trip.id)).toMatchObject({ ok: false });

    signInAs("user_a");
    expect(await getSavingsGoals()).toMatchObject([
      { name: "Trip", savedCents: 0 },
    ]);
    expect(await rows("select * from expenses")).toEqual([]);
  });

  it("only counts the owner's own expenses toward a goal", async () => {
    const trip = await addTrip();
    await give(trip.id, "150");
    // Another user's expense pointing at the goal can't inflate it.
    await rows(
      `insert into expenses (user_id, month, spent_on, description, category, amount_cents, goal_id)
       values ('user_b', '2026-10', '2026-10-03', 'x', 'Savings', 99900, $1)`,
      [trip.id],
    );
    expect((await getSavingsGoals())[0]?.savedCents).toBe(15_000);
  });

  it("reports a missing goal and needs a signed-in user", async () => {
    expect(await give(MISSING_ID, "150")).toMatchObject({ ok: false });
    signOut();
    expect(
      await createSavingsGoal({ name: "Trip", target: "1", month: "2026-01" }),
    ).toMatchObject({ ok: false });
  });
});
