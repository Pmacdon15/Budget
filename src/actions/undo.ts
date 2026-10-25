"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/undo";
import { idSchema, monthSchema } from "@/lib/schemas";
import type { ActionResult } from "@/lib/types";

/** An undoable delete's result: on success, the id the Undo button sends back. */
export type UndoableResult =
  | { ok: true; undoId: string }
  | Exclude<ActionResult, { ok: true }>;

async function undoable(
  remove: () => Promise<string>,
): Promise<UndoableResult> {
  let undoId = "";
  const result = await runAction(async () => {
    undoId = await remove();
  });
  return result.ok ? { ok: true, undoId } : result;
}

export async function deleteExpenseWithUndo(id: string) {
  return undoable(() => dal.deleteExpenseWithUndo(idSchema.parse(id)));
}

export async function stopFixedItemWithUndo(id: string, fromMonth: string) {
  return undoable(() =>
    dal.stopFixedItemWithUndo(idSchema.parse(id), monthSchema.parse(fromMonth)),
  );
}

export async function deleteIncomeWithUndo(id: string) {
  return undoable(() => dal.deleteIncomeWithUndo(idSchema.parse(id)));
}

export async function undoDelete(undoId: string) {
  return runAction(async () => {
    await dal.undoDelete(idSchema.parse(undoId));
  });
}
