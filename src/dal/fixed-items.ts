import "server-only";
import { currentUserIdOrThrow, requireUserId } from "@/dal/auth";
import { NotFoundError } from "@/dal/errors";
import {
  deleteFixedItemRow,
  insertFixedItem,
  selectFixedItem,
  selectFixedItems,
  setFixedItemEndMonth,
  splitFixedItem,
  updateFixedItemValues,
} from "@/db/fixed-items";
import { addMonths } from "@/lib/month";
import type { FixedItemInput } from "@/lib/schemas";
import type { FixedItem } from "@/lib/types";

/* ---------- Reads ---------- */

export async function getFixedItems(): Promise<FixedItem[]> {
  const userId = await requireUserId();
  return selectFixedItems(userId);
}

/* ---------- Writes ---------- */

const values = (input: FixedItemInput) => ({
  name: input.name,
  category: input.category,
  amountCents: input.amount,
  dueDay: input.dueDay,
});

export async function createFixedItem(input: FixedItemInput) {
  const userId = await currentUserIdOrThrow();
  await insertFixedItem(userId, { ...values(input), startMonth: input.month });
}

/**
 * Edits apply from the month being viewed onward, so past months (and past
 * reports) keep the amounts that were true at the time.
 */
export async function updateFixedItem(id: string, input: FixedItemInput) {
  await updateFixedItemFor(await currentUserIdOrThrow(), id, input);
}

/**
 * The same rule for a caller verified some other way (the MCP server's
 * token): the change applies from `input.month` onward. `userId` must come
 * from that verification, never from the request.
 */
export async function updateFixedItemFor(
  userId: string,
  id: string,
  input: FixedItemInput,
) {
  const item = await selectFixedItem(userId, id);
  if (!item) throw new NotFoundError();

  if (item.startMonth >= input.month) {
    await updateFixedItemValues(userId, id, values(input));
    return;
  }
  await splitFixedItem(userId, id, addMonths(input.month, -1), {
    ...values(input),
    startMonth: input.month,
    endMonth: item.endMonth,
  });
}

/** Stops an item from the given month onward (or deletes it if it started then). */
export async function stopFixedItem(id: string, fromMonth: string) {
  const userId = await currentUserIdOrThrow();
  const item = await selectFixedItem(userId, id);
  if (!item) throw new NotFoundError();

  if (item.startMonth >= fromMonth) {
    await deleteFixedItemRow(userId, id);
  } else {
    await setFixedItemEndMonth(userId, id, addMonths(fromMonth, -1));
  }
}
