"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/rollover";
import { type RolloverFormValues, rolloverSchema } from "@/lib/rollover";

export async function saveRollover(values: RolloverFormValues) {
  return runAction(async () => {
    await dal.saveRollover(rolloverSchema.parse(values));
  });
}
