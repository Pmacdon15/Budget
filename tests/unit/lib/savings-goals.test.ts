import { describe, expect, it } from "vitest";
import {
  contributionSchema,
  goalHint,
  goalProgress,
  type SavingsGoal,
  savingsGoalSchema,
} from "@/lib/savings-goals";

const goal = (overrides: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: "g1",
  name: "Trip",
  targetCents: 120_000,
  targetDate: "2026-12-31",
  startMonth: "2026-01",
  savedCents: 0,
  ...overrides,
});

describe("savingsGoalSchema", () => {
  it("parses a goal with and without a date", () => {
    expect(
      savingsGoalSchema.parse({
        name: " Trip ",
        target: "1,200",
        targetDate: "2026-12-31",
        month: "2026-01",
      }),
    ).toEqual({
      name: "Trip",
      target: 120_000,
      targetDate: "2026-12-31",
      month: "2026-01",
    });
    expect(
      savingsGoalSchema.parse({ name: "Fund", target: "500", month: "2026-01" })
        .targetDate,
    ).toBeNull();
  });

  it("needs a name and a target above zero", () => {
    const result = savingsGoalSchema.safeParse({
      name: "",
      target: "0",
      month: "2026-01",
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      "name",
      "target",
    ]);
  });
});

describe("contributionSchema", () => {
  it("needs a positive amount and a date", () => {
    expect(
      contributionSchema
        .safeParse({
          goalId: "11111111-1111-4111-8111-111111111111",
          amount: "0",
          spentOn: "",
        })
        .error?.issues.map((i) => i.path[0]),
    ).toEqual(["amount", "spentOn"]);
  });
});

describe("goalProgress", () => {
  it("is on track at or above an even pace", () => {
    // 12 months Jan–Dec, now October (10 of 12): pace is $1,000 of $1,200.
    expect(goalProgress(goal({ savedCents: 100_000 }), "2026-10")).toEqual({
      savedCents: 100_000,
      leftCents: 20_000,
      fraction: 100_000 / 120_000,
      status: "on-track",
      monthsLeft: 3,
      monthlyNeededCents: 6_667,
    });
  });

  it("is behind below the pace", () => {
    expect(goalProgress(goal({ savedCents: 50_000 }), "2026-10").status).toBe(
      "behind",
    );
  });

  it("is reached once the target is met, even early", () => {
    expect(goalProgress(goal({ savedCents: 130_000 }), "2026-03")).toEqual({
      savedCents: 130_000,
      leftCents: 0,
      fraction: 1,
      status: "reached",
      monthsLeft: null,
      monthlyNeededCents: null,
    });
  });

  it("has no pace without a date", () => {
    expect(
      goalProgress(goal({ targetDate: null, savedCents: 1 }), "2026-10"),
    ).toMatchObject({ status: "no-date", monthsLeft: null });
  });

  it("is behind with nothing left to save in once the date has passed", () => {
    expect(
      goalProgress(goal({ savedCents: 110_000 }), "2027-02"),
    ).toMatchObject({
      status: "behind",
      monthsLeft: 0,
      monthlyNeededCents: 10_000,
    });
  });
});

describe("goalHint", () => {
  it("says what to save each month, or what's left", () => {
    const g = goal({ savedCents: 100_000 });
    expect(goalHint(goalProgress(g, "2026-10"), g.targetDate)).toBe(
      "Save $66.67 a month to reach it by Dec 2026",
    );
    const noDate = goal({ targetDate: null, savedCents: 20_000 });
    expect(goalHint(goalProgress(noDate, "2026-10"), null)).toBe(
      "$1,000.00 to go",
    );
    const late = goal({ savedCents: 110_000 });
    expect(goalHint(goalProgress(late, "2027-02"), late.targetDate)).toBe(
      "$100.00 short of the Dec 2026 target",
    );
    const done = goal({ savedCents: 120_000 });
    expect(goalHint(goalProgress(done, "2026-10"), done.targetDate)).toBe(
      "Goal reached",
    );
  });
});
