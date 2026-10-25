"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/bank-balance";
import {
  type BankBalanceFormValues,
  bankBalanceSchema,
} from "@/lib/bank-balance";

export async function setBankBalance(values: BankBalanceFormValues) {
  return runAction(async () => {
    await dal.setBankBalance(bankBalanceSchema.parse(values));
  });
}

export async function clearBankBalance() {
  return runAction(async () => {
    await dal.clearBankBalance();
  });
}
