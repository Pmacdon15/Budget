import "server-only";
import { db, type Row } from "@/db/client";
import type { SavingsGoal } from "@/lib/savings-goals";

/** Raw SQL for savings goals. Callers (the DAL) handle auth and rules. */

/** The category money put toward a goal is saved under. */
export const GOAL_CATEGORY = "Savings";

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const toGoal = (r: Row): SavingsGoal => ({
  id: r.id,
  name: r.name,
  targetCents: Number(r.target_cents),
  targetDate: toDateString(r.target_date),
  startMonth: String(r.start_month),
  savedCents: Number(r.saved_cents ?? 0),
});

/** Every goal with what's been put toward it, nearest deadline first. */
export async function selectGoals(userId: string): Promise<SavingsGoal[]> {
  const rows = await db()`
    select g.id, g.name, g.target_cents, g.target_date, g.start_month,
           coalesce((
             select sum(e.amount_cents) from expenses e
             where e.goal_id = g.id and e.user_id = g.user_id
           ), 0) as saved_cents
    from savings_goals g
    where g.user_id = ${userId}
    order by g.target_date asc nulls last, g.created_at asc
  `;
  return rows.map(toGoal);
}

export async function selectGoal(
  userId: string,
  id: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db()`
    select id, name from savings_goals where id = ${id} and user_id = ${userId}
  `;
  return row ? { id: row.id, name: row.name } : null;
}

type GoalValues = {
  name: string;
  targetCents: number;
  targetDate: string | null;
};

export async function insertGoal(
  userId: string,
  values: GoalValues & { startMonth: string },
) {
  await db()`
    insert into savings_goals (user_id, name, target_cents, target_date, start_month)
    values (${userId}, ${values.name}, ${values.targetCents},
            ${values.targetDate}, ${values.startMonth})
  `;
}

/** Returns false when no row matched (missing, or not this user's). */
export async function updateGoalRow(
  userId: string,
  id: string,
  values: GoalValues,
): Promise<boolean> {
  const rows = await db()`
    update savings_goals
    set name = ${values.name}, target_cents = ${values.targetCents},
        target_date = ${values.targetDate}
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Money already put toward it stays as Savings expenses, unlinked. */
export async function deleteGoalRow(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db()`
    delete from savings_goals where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Saves money put toward a goal as a Savings expense linked to it. */
export async function insertContribution(
  userId: string,
  goal: { id: string; name: string },
  values: { spentOn: string; amountCents: number },
) {
  await db()`
    insert into expenses (user_id, month, spent_on, description, category,
                          amount_cents, goal_id)
    values (${userId}, ${values.spentOn.slice(0, 7)}, ${values.spentOn},
            ${`Saved for ${goal.name}`}, ${GOAL_CATEGORY},
            ${values.amountCents}, ${goal.id})
  `;
}
