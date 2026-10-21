"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { addMonths, isMonth, monthOfDate } from "@/lib/month";

export type ActionResult = { ok: true } | { ok: false; error: string };

const money = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid amount, like 1250.00",
    });
    return z.NEVER;
  }
  return cents;
});

const month = z.string().refine(isMonth, "Invalid month");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const text = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(120, `${label} is too long`);

const fixedSchema = z.object({
  name: text("Name"),
  category: z.enum(CATEGORY_NAMES),
  amount: money,
  dueDay: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(31).nullable()),
  month,
});

const incomeSchema = z.object({
  label: text("Source"),
  amount: money,
  month,
  receivedOn: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(date.nullable()),
});

const expenseSchema = z.object({
  description: text("Description"),
  category: z.enum(CATEGORY_NAMES),
  amount: money,
  spentOn: date,
});

async function userIdOrThrow() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
  }
  console.error(error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

const fields = (formData: FormData) =>
  Object.fromEntries(formData) as Record<string, string>;

/* ---------- Fixed monthly items ---------- */

export async function createFixedItem(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = fixedSchema.parse(fields(formData));
    await db()`
      insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month)
      values (${userId}, ${input.name}, ${input.category}, ${input.amount}, ${input.dueDay}, ${input.month})
    `;
    return done();
  } catch (error) {
    return fail(error);
  }
}

/**
 * Edits apply from the month being viewed onward, so past months (and past reports)
 * keep the amounts that were true at the time.
 */
export async function updateFixedItem(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = fixedSchema.parse(fields(formData));
    const [item] = await db()`
      select start_month, end_month from fixed_items where id = ${id} and user_id = ${userId}
    `;
    if (!item) return { ok: false, error: "That item no longer exists." };

    if (String(item.start_month) >= input.month) {
      await db()`
        update fixed_items
        set name = ${input.name}, category = ${input.category},
            amount_cents = ${input.amount}, due_day = ${input.dueDay}
        where id = ${id} and user_id = ${userId}
      `;
    } else {
      const previous = addMonths(input.month, -1);
      await db().transaction((sql) => [
        sql`update fixed_items set end_month = ${previous} where id = ${id} and user_id = ${userId}`,
        sql`
          insert into fixed_items (user_id, name, category, amount_cents, due_day, start_month, end_month)
          values (${userId}, ${input.name}, ${input.category}, ${input.amount}, ${input.dueDay}, ${input.month}, ${item.end_month})
        `,
      ]);
    }
    return done();
  } catch (error) {
    return fail(error);
  }
}

/** Stops an item from the given month onward (or deletes it if it started this month). */
export async function stopFixedItem(
  id: string,
  fromMonth: string,
): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const from = month.parse(fromMonth);
    const [item] = await db()`
      select start_month from fixed_items where id = ${id} and user_id = ${userId}
    `;
    if (!item) return { ok: false, error: "That item no longer exists." };
    if (String(item.start_month) >= from) {
      await db()`delete from fixed_items where id = ${id} and user_id = ${userId}`;
    } else {
      await db()`
        update fixed_items set end_month = ${addMonths(from, -1)}
        where id = ${id} and user_id = ${userId}
      `;
    }
    return done();
  } catch (error) {
    return fail(error);
  }
}

/* ---------- Take-home income ---------- */

export async function createIncome(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = incomeSchema.parse(fields(formData));
    await db()`
      insert into income (user_id, month, label, amount_cents, received_on)
      values (${userId}, ${input.month}, ${input.label}, ${input.amount}, ${input.receivedOn})
    `;
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function updateIncome(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = incomeSchema.parse(fields(formData));
    await db()`
      update income
      set month = ${input.month}, label = ${input.label},
          amount_cents = ${input.amount}, received_on = ${input.receivedOn}
      where id = ${id} and user_id = ${userId}
    `;
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    await db()`delete from income where id = ${id} and user_id = ${userId}`;
    return done();
  } catch (error) {
    return fail(error);
  }
}

/* ---------- One-off expenses ---------- */

export async function createExpense(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = expenseSchema.parse(fields(formData));
    await db()`
      insert into expenses (user_id, month, spent_on, description, category, amount_cents)
      values (${userId}, ${monthOfDate(input.spentOn)}, ${input.spentOn}, ${input.description}, ${input.category}, ${input.amount})
    `;
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function updateExpense(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    const input = expenseSchema.parse(fields(formData));
    await db()`
      update expenses
      set month = ${monthOfDate(input.spentOn)}, spent_on = ${input.spentOn},
          description = ${input.description}, category = ${input.category},
          amount_cents = ${input.amount}
      where id = ${id} and user_id = ${userId}
    `;
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  try {
    const userId = await userIdOrThrow();
    await db()`delete from expenses where id = ${id} and user_id = ${userId}`;
    return done();
  } catch (error) {
    return fail(error);
  }
}
