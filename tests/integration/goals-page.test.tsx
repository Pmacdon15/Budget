import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contributeToGoal, createSavingsGoal } from "@/actions/savings-goals";
import GoalsPage from "@/app/(app)/goals/page";
import { getSavingsGoals } from "@/dal/savings-goals";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T21:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const render = async () =>
  textOf(
    await renderPage(GoalsPage({ searchParams: searchParams("2026-10") })),
  );

async function goal(name: string, target: string, targetDate = "") {
  await createSavingsGoal({ name, target, targetDate, month: "2026-01" });
  const created = (await getSavingsGoals()).find((g) => g.name === name);
  if (!created) throw new Error(`${name} was not created`);
  return created;
}

describe("Savings goals page", () => {
  it("keeps its heading in the static shell without any money", async () => {
    const text = textOf(
      await renderShell(GoalsPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Savings goals");
    expect(text).not.toMatch(/\$\d/);
  });

  it("invites adding the first goal", async () => {
    const text = await render();
    expect(text).toContain("No savings goals yet");
    expect(text).toContain("Add goal");
  });

  it("shows each goal's progress and pace", async () => {
    const trip = await goal("Trip", "1200", "2026-12-31");
    const fund = await goal("Emergency fund", "5000");
    const bike = await goal("Bike", "100", "2026-06-30");
    await contributeToGoal({
      goalId: trip.id,
      amount: "1000",
      spentOn: "2026-10-03",
    });
    await contributeToGoal({
      goalId: fund.id,
      amount: "250",
      spentOn: "2026-10-03",
    });
    await contributeToGoal({
      goalId: bike.id,
      amount: "100",
      spentOn: "2026-05-03",
    });

    const text = await render();
    expect(text).toContain("$1,000.00 of $1,200.00");
    expect(text).toContain("On track");
    expect(text).toContain("Save $66.67 a month to reach it by Dec 2026");
    expect(text).toContain("$250.00 of $5,000.00");
    expect(text).toContain("$4,750.00 to go");
    expect(text).toContain("Reached");
    expect(text).toContain("Goal reached");
    expect(text).toContain("Add money");
  });

  it("shows only the signed-in user's goals", async () => {
    await goal("Trip", "1200");
    signInAs("user_b");
    const text = await render();
    expect(text).toContain("No savings goals yet");
    expect(text).not.toContain("Trip");
  });
});
