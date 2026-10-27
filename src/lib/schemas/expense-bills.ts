import { z } from "zod";
import { fixedItemSchema, idSchema } from "@/lib/schemas";

/*
 * Turning saved expenses into fixed bills from the Spending page. The browser
 * validates with these first; the server actions parse the same input again.
 */

/** A checkbox: "on" when ticked. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const newBill = fixedItemSchema.pick({
  name: true,
  category: true,
  dueDay: true,
  matchKeywords: true,
});

/**
 * One expense, from its row's "Make fixed bill" dialog: either a new monthly
 * bill (pre-filled from the expense), or this month's payment of a bill the
 * user already has that it matched (optionally taking this charge's amount).
 */
export const makeFixedBillSchema = z.discriminatedUnion("mode", [
  newBill.extend({ mode: z.literal("new"), expenseId: idSchema }),
  z.object({
    mode: z.literal("existing"),
    expenseId: idSchema,
    fixedItemId: idSchema,
    updateAmount: checkbox,
  }),
]);

export type MakeFixedBillFormValues = z.input<typeof makeFixedBillSchema>;
export type MakeFixedBillInput = z.output<typeof makeFixedBillSchema>;

/** The most expenses one bill can be made from at once (two years of months). */
export const MAX_EXPENSES_PER_BILL = 24;

/** The most bills converted in one go. */
export const MAX_BILLS_AT_ONCE = 50;

/**
 * The bulk dialog's picks: each a group of one merchant's monthly charges
 * that becomes one bill (or pays one the user already has), each charge that
 * month's payment.
 */
export const convertSubscriptionsSchema = z.object({
  items: z
    .array(
      z.object({
        expenseIds: z
          .array(idSchema)
          .min(1, "Pick at least one charge")
          .max(MAX_EXPENSES_PER_BILL, "Too many charges for one bill"),
        name: newBill.shape.name,
        category: newBill.shape.category,
        /** Pay this existing bill instead of adding a new one. */
        fixedItemId: idSchema.optional(),
        /** With fixedItemId: the bill takes the newest charge's amount. */
        updateAmount: z.boolean().optional(),
      }),
    )
    .min(1, "Pick at least one subscription")
    .max(MAX_BILLS_AT_ONCE, "Convert fewer at once"),
});

export type ConvertSubscriptionsValues = z.input<
  typeof convertSubscriptionsSchema
>;
export type ConvertSubscriptionsInput = z.output<
  typeof convertSubscriptionsSchema
>;

/** What converting picked subscriptions did. */
export type ConvertSubscriptionsResult = {
  /** New bills added. */
  created: number;
  /** Charges that became a bill's payment (new or existing bills). */
  payments: number;
  /** Charges left as expenses: their month isn't one the bill runs in, or is already paid. */
  skipped: number;
};
