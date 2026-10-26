"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/accounts";
import {
  type AccountFormValues,
  accountSchema,
  type TransferFormValues,
  transferSchema,
} from "@/lib/accounts";
import { idSchema } from "@/lib/schemas";

export async function createAccount(values: AccountFormValues) {
  return runAction(async () => {
    await dal.createAccount(accountSchema.parse(values));
  });
}

export async function updateAccount(id: string, values: AccountFormValues) {
  return runAction(async () => {
    const input = accountSchema.parse(values);
    await dal.updateAccount(idSchema.parse(id), input);
  });
}

export async function deleteAccount(id: string) {
  return runAction(async () => {
    await dal.deleteAccount(idSchema.parse(id));
  });
}

export async function createTransfer(values: TransferFormValues) {
  return runAction(async () => {
    await dal.createTransfer(transferSchema.parse(values));
  });
}

export async function deleteTransfer(id: string) {
  return runAction(async () => {
    await dal.deleteTransfer(idSchema.parse(id));
  });
}

/** Creates an account the AI proposed. */
export async function approvePendingAccount(id: string) {
  return runAction(async () => {
    await dal.approvePendingAccount(idSchema.parse(id));
  });
}

/** Throws a proposed account away without creating it. */
export async function rejectPendingAccount(id: string) {
  return runAction(async () => {
    await dal.rejectPendingAccount(idSchema.parse(id));
  });
}
