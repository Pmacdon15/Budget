import { z } from "zod";
import { idSchema, incomeSchema, monthSchema } from "@/lib/schemas";

/*
 * Repeating take-home: a paycheque expected every month. It's optional and
 * never counts on its own; each month the user adds it (at the usual amount or
 * a different one) or skips it. Shared by the browser and the server.
 */

/** Set up or edit a repeating paycheque. `month` is where it starts (or the month being viewed when editing). */
export const recurringIncomeSchema = incomeSchema.pick({
  label: true,
  amount: true,
  month: true,
});

/** Adds this month's deposit for a repeating paycheque, at whatever amount actually landed. */
export const recordRecurringIncomeSchema = z.object({
  recurringId: idSchema,
  month: monthSchema,
  amount: incomeSchema.shape.amount,
  receivedOn: incomeSchema.shape.receivedOn,
});

/** Skips (or un-skips) one month of a repeating paycheque. */
export const recurringMonthSchema = z.object({
  recurringId: idSchema,
  month: monthSchema,
});

export type RecurringIncomeFormValues = z.input<typeof recurringIncomeSchema>;
export type RecurringIncomeInput = z.output<typeof recurringIncomeSchema>;
export type RecordRecurringIncomeFormValues = z.input<
  typeof recordRecurringIncomeSchema
>;
export type RecordRecurringIncomeInput = z.output<
  typeof recordRecurringIncomeSchema
>;
export type RecurringMonthInput = z.output<typeof recurringMonthSchema>;

export type RecurringIncome = {
  id: string;
  label: string;
  amountCents: number;
  startMonth: string;
  endMonth: string | null;
};

/** Where a repeating paycheque stands in one month. */
export type RecurringIncomeStatus =
  | { state: "expected" }
  | { state: "added"; amountCents: number }
  | { state: "skipped" };

export type RecurringIncomeForMonth = RecurringIncome & {
  status: RecurringIncomeStatus;
};

export function isActiveIn(item: RecurringIncome, month: string) {
  return (
    item.startMonth <= month &&
    (item.endMonth === null || item.endMonth >= month)
  );
}
