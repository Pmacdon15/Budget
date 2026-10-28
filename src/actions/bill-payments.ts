"use server";

import { runAction } from "@/actions/run-action";
import * as dal from "@/dal/bill-payments";
import { billPaymentSchema } from "@/lib/bill-payments";

type Values = { fixedItemId: string; month: string; offBankAccount?: boolean };

export async function markBillPaid(values: Values) {
  return runAction(async () => {
    await dal.markBillPaid(billPaymentSchema.parse(values));
  });
}

export async function unmarkBillPaid(values: Values) {
  return runAction(async () => {
    await dal.unmarkBillPaid(billPaymentSchema.parse(values));
  });
}
