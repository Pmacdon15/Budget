import { z } from "zod";
import { formatMoney, parseMoney } from "@/lib/money";
import { idSchema, incomeSchema, monthSchema } from "@/lib/schemas";

/*
 * Savings goals. Money put toward a goal is saved as a Savings expense linked
 * to it, so a goal's progress is the sum of those expenses, and the month's
 * totals already treat it as money set aside. Shared by browser and server.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const target = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter a target, like 5000.00" });
    return z.NEVER;
  }
  return cents;
});

/** Add or edit a goal. `month` is the month being viewed, where a new goal starts. */
export const savingsGoalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long"),
  target,
  targetDate: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(date.nullable()),
  month: monthSchema,
});

/** Put money toward a goal. */
export const contributionSchema = z.object({
  goalId: idSchema,
  amount: incomeSchema.shape.amount.refine(
    (cents) => cents > 0,
    "Enter an amount, like 100.00",
  ),
  spentOn: date,
});

export type SavingsGoalFormValues = z.input<typeof savingsGoalSchema>;
export type SavingsGoalInput = z.output<typeof savingsGoalSchema>;
export type ContributionFormValues = z.input<typeof contributionSchema>;
export type ContributionInput = z.output<typeof contributionSchema>;

export type SavingsGoal = {
  id: string;
  name: string;
  targetCents: number;
  /** YYYY-MM-DD, or null for no deadline. */
  targetDate: string | null;
  startMonth: string;
  savedCents: number;
};

export type GoalStatus = "reached" | "on-track" | "behind" | "no-date";

export type GoalProgress = {
  savedCents: number;
  leftCents: number;
  /** 0–1, capped at 1. */
  fraction: number;
  status: GoalStatus;
  /** Months left before the target date, counting the current one; null without a date. */
  monthsLeft: number | null;
  /** What to save each month from now to reach it on time; null without a date or once reached. */
  monthlyNeededCents: number | null;
};

const monthIndex = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
};

/**
 * Where a goal stands as of `currentMonth`. On track means at least as much is
 * saved as an even pace from the goal's start month to its target month.
 */
export function goalProgress(
  goal: SavingsGoal,
  currentMonth: string,
): GoalProgress {
  const savedCents = goal.savedCents;
  const leftCents = Math.max(goal.targetCents - savedCents, 0);
  const fraction = Math.min(savedCents / goal.targetCents, 1);

  if (leftCents === 0) {
    return {
      savedCents,
      leftCents,
      fraction,
      status: "reached",
      monthsLeft: null,
      monthlyNeededCents: null,
    };
  }
  if (!goal.targetDate) {
    return {
      savedCents,
      leftCents,
      fraction,
      status: "no-date",
      monthsLeft: null,
      monthlyNeededCents: null,
    };
  }

  const end = monthIndex(goal.targetDate.slice(0, 7));
  const now = monthIndex(currentMonth);
  const start = monthIndex(goal.startMonth);
  const monthsLeft = Math.max(end - now + 1, 0);
  const totalMonths = Math.max(end - start + 1, 1);
  const elapsed = Math.min(Math.max(now - start + 1, 0), totalMonths);
  const expectedCents = Math.round((goal.targetCents * elapsed) / totalMonths);

  return {
    savedCents,
    leftCents,
    fraction,
    status:
      savedCents >= expectedCents && monthsLeft > 0 ? "on-track" : "behind",
    monthsLeft,
    monthlyNeededCents:
      monthsLeft > 0 ? Math.ceil(leftCents / monthsLeft) : leftCents,
  };
}

/** One line under a goal, e.g. "Save $250.00 a month to reach it by Jun 2027". */
export function goalHint(progress: GoalProgress, targetDate: string | null) {
  switch (progress.status) {
    case "reached":
      return "Goal reached";
    case "no-date":
      return `${formatMoney(progress.leftCents)} to go`;
    default: {
      const by = targetDate
        ? new Intl.DateTimeFormat("en-CA", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${targetDate}T00:00:00Z`))
        : "";
      if (progress.monthsLeft === 0) {
        return `${formatMoney(progress.leftCents)} short of the ${by} target`;
      }
      return `Save ${formatMoney(progress.monthlyNeededCents ?? 0)} a month to reach it by ${by}`;
    }
  }
}
