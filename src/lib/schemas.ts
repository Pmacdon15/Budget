import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories";
import { parseMoney } from "@/lib/money";
import { isMonth } from "@/lib/month";

/**
 * Zod schemas shared by the browser and the server.
 *
 * Forms validate with these before calling a mutation, and every server action
 * parses its input with the same schema again, so the client check is only for
 * fast feedback — the server never trusts it.
 */

const money = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid amount, like 1250.00",
    });
    return z.NEVER;
  }
  return cents;
});

const text = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(120, `${label} is too long`);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const category = z.enum(CATEGORY_NAMES, { error: "Pick a category" });

export const monthSchema = z.string().refine(isMonth, "Invalid month");

export const idSchema = z.uuid({ error: "Invalid id" });

export const fixedItemSchema = z.object({
  name: text("Name"),
  category,
  amount: money,
  dueDay: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(
      z
        .number({ error: "Due day must be a number" })
        .int("Due day must be a whole number")
        .min(1, "Due day must be between 1 and 31")
        .max(31, "Due day must be between 1 and 31")
        .nullable(),
    ),
  month: monthSchema,
});

export const incomeSchema = z.object({
  label: text("Source"),
  amount: money,
  month: monthSchema,
  receivedOn: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(date.nullable()),
});

export const expenseSchema = z.object({
  description: text("Description"),
  category,
  amount: money,
  spentOn: date,
});

/*
 * What a scanned receipt adds to the expense form, as hidden inputs. The values
 * come from the receipt reader, not from typing, so they are lenient: anything
 * unreadable becomes null instead of a validation error the user could not see
 * or fix. Only `receiptImage` matters for security, and the DAL checks that it
 * points into the caller's own folder before storing it.
 */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, max) || null);

const optionalMoney = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? parseMoney(v) : null));

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const receiptFieldsSchema = z.object({
  receiptImage: optionalText(200),
  receiptMerchant: optionalText(120),
  receiptPurchasedOn: optionalDate,
  receiptSubtotal: optionalMoney,
  receiptTax: optionalMoney,
  receiptTotal: optionalMoney,
  receiptText: optionalText(4000),
});

/** The add-expense form: an expense, optionally with the receipt it was scanned from. */
export const expenseWithReceiptSchema = expenseSchema.extend(
  receiptFieldsSchema.shape,
);

const yearMonth = z.string().refine(isMonth, "Pick a month");

/** Query string of the expense download: `?format=…&from=…&to=…&category=…`. */
export const expenseExportSchema = z
  .object({
    format: z.enum(["csv", "xlsx", "pdf"], { error: "Pick a file type" }),
    from: yearMonth,
    to: yearMonth,
    categories: z
      .array(category)
      .min(1, "Pick at least one category")
      .transform((list) => [...new Set(list)]),
    photos: z.boolean().default(false),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start month must come before the end month",
    path: ["to"],
  });

/** Raw form values (what the browser sends). */
export type FixedItemFormValues = z.input<typeof fixedItemSchema>;
export type IncomeFormValues = z.input<typeof incomeSchema>;
export type ExpenseFormValues = z.input<typeof expenseWithReceiptSchema>;
export type ExpenseExportInput = z.output<typeof expenseExportSchema>;

/** Parsed, typed values (what the DAL receives). */
export type FixedItemInput = z.output<typeof fixedItemSchema>;
export type IncomeInput = z.output<typeof incomeSchema>;
export type ExpenseInput = z.output<typeof expenseSchema>;
export type ReceiptFieldsInput = z.output<typeof receiptFieldsSchema>;
