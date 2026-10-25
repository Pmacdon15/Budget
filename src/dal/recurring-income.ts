import "server-only";
import { cache } from "react";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteRecurringRow,
  deleteSkip,
  insertRecurring,
  insertRecurringDeposit,
  insertSkip,
  selectRecurring,
  selectRecurringForMonth,
  setRecurringEndMonth,
  updateRecurringValues,
} from "@/db/recurring-income";
import { addMonths } from "@/lib/month";
import {
  isActiveIn,
  type RecordRecurringIncomeInput,
  type RecurringIncome,
  type RecurringIncomeForMonth,
  type RecurringIncomeInput,
  type RecurringMonthInput,
} from "@/lib/recurring-income";

/* ---------- Reads ---------- */

/** The signed-in user's repeating paycheques for `month`, and whether each was added or skipped. */
export const getRecurringIncomeForMonth = cache(
  async (month: string): Promise<RecurringIncomeForMonth[]> => {
    const userId = await requireUserId();
    const rows = await selectRecurringForMonth(userId, month);
    return rows.map(({ addedCents, skipped, ...item }) => ({
      ...item,
      status:
        addedCents != null
          ? { state: "added", amountCents: addedCents }
          : skipped
            ? { state: "skipped" }
            : { state: "expected" },
    }));
  },
);

/* ---------- Writes ---------- */

async function ownRecurring(
  userId: string,
  id: string,
): Promise<RecurringIncome> {
  const item = await selectRecurring(userId, id);
  if (!item) throw new NotFoundError();
  return item;
}

/** Starts a repeating paycheque from `input.month`. */
export async function createRecurringIncome(input: RecurringIncomeInput) {
  const userId = await currentUserIdOrThrow();
  await insertRecurring(userId, {
    label: input.label,
    amountCents: input.amount,
    startMonth: input.month,
  });
}

/** Changes the usual name and amount. Deposits already added keep what they were. */
export async function updateRecurringIncome(
  id: string,
  input: RecurringIncomeInput,
) {
  const userId = await currentUserIdOrThrow();
  await ownRecurring(userId, id);
  await updateRecurringValues(userId, id, {
    label: input.label,
    amountCents: input.amount,
  });
}

/**
 * Stops expecting it from `fromMonth` on (or removes it, if it started then).
 * Deposits already added are real take-home and stay.
 */
export async function stopRecurringIncome(id: string, fromMonth: string) {
  const userId = await currentUserIdOrThrow();
  const item = await ownRecurring(userId, id);
  if (item.startMonth >= fromMonth) {
    await deleteRecurringRow(userId, id);
  } else {
    await setRecurringEndMonth(userId, id, addMonths(fromMonth, -1));
  }
}

/** Adds this month's deposit at the amount that actually landed. */
export async function recordRecurringIncome(input: RecordRecurringIncomeInput) {
  const userId = await currentUserIdOrThrow();
  const item = await ownRecurring(userId, input.recurringId);
  if (!isActiveIn(item, input.month)) throw new NotFoundError();
  const added = await insertRecurringDeposit(userId, item, {
    month: input.month,
    amountCents: input.amount,
    receivedOn: input.receivedOn,
  });
  if (!added) {
    throw new NotFoundError(
      "That paycheque was already added for this month. Edit it in the list instead.",
    );
  }
}

export async function skipRecurringIncome(input: RecurringMonthInput) {
  const userId = await currentUserIdOrThrow();
  const item = await ownRecurring(userId, input.recurringId);
  if (!isActiveIn(item, input.month)) throw new NotFoundError();
  await insertSkip(userId, item.id, input.month);
}

export async function unskipRecurringIncome(input: RecurringMonthInput) {
  const userId = await currentUserIdOrThrow();
  const item = await ownRecurring(userId, input.recurringId);
  await deleteSkip(userId, item.id, input.month);
}
