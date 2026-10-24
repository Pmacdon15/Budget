"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/fixed-items";
import {
  type FixedItemFormValues,
  fixedItemSchema,
  idSchema,
  monthSchema,
} from "@/lib/schemas";

export async function createFixedItem(values: FixedItemFormValues) {
  return runAction(async () => {
    const input = fixedItemSchema.parse(values);
    await dal.createFixedItem(input);
  });
}

export async function updateFixedItem(id: string, values: FixedItemFormValues) {
  return runAction(async () => {
    const input = fixedItemSchema.parse(values);
    await dal.updateFixedItem(idSchema.parse(id), input);
  });
}

export async function stopFixedItem(id: string, fromMonth: string) {
  return runAction(async () => {
    await dal.stopFixedItem(idSchema.parse(id), monthSchema.parse(fromMonth));
  });
}
