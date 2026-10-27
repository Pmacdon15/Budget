import "server-only";
import { createHash } from "node:crypto";
import { selectExpenseById, setExpenseReceipt } from "@/db/expenses";
import { selectPendingExpense, setPendingReceipt } from "@/db/pending-expenses";
import {
  type ExistingReceipt,
  isSameReceipt,
  type ReceiptSource,
  readingOf,
  selectBillPaymentTarget,
  selectExpenseReceipt,
  selectPendingReceipt,
  setBillPaymentReceipt,
} from "@/db/receipt-files";
import { emailDocument } from "@/lib/email-html";
import {
  attachReceiptInputSchema,
  type ReceiptDetails,
  type ReceiptInput,
  toCents,
} from "@/lib/pending-expenses";
import { decodeBase64File } from "@/lib/receipt-bytes";
import {
  EMAIL_CONTENT_TYPE,
  MAX_PDF_BYTES,
  newReceiptFilePathname,
  normalizeMessageId,
  PDF_CONTENT_TYPE,
  type ReceiptFileKind,
  type ReceiptKind,
  receiptKindLabel,
} from "@/lib/receipt-files";
import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  newReceiptImagePathname,
} from "@/lib/receipt-image";
import {
  deleteReceiptImage,
  putReceiptFile,
  putReceiptImage,
} from "@/lib/receipt-store";

/*
 * Receipts the AI sends from email: what it read off them, plus a copy to
 * keep (a JPEG, the PDF attachment, or the email itself when there is no
 * attachment). Used by add_expense and attach_receipt. A copy is validated
 * before anything is stored, and the same email or file is never stored twice
 * on the same item.
 */

/** Input a schema can't catch (a bad file, an empty receipt), as a readable tool error. */
export class ToolInputError extends Error {}

/** A tool's answer: a sentence for the AI, plus the same thing as data. */
type ToolResult = {
  summary: string;
  data: Record<string, unknown>;
  isError?: boolean;
};

type Caller = { userId: string };

/** A receipt that passed validation, with its copy still in memory. */
export type PreparedReceipt = {
  details: ReceiptDetails;
  /** Which email or file it is, to spot a re-send. */
  source: ReceiptSource;
  image: Uint8Array | null;
  file: {
    kind: ReceiptFileKind;
    body: Uint8Array | string;
    bytes: number;
  } | null;
  /**
   * Why the PDF or JPEG that was sent wasn't kept, when the email itself was
   * saved instead. Null when the copy sent is the one saved.
   */
  fallback: string | null;
};

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

const orNull = (value: string | undefined) => value?.trim() || null;

/**
 * Checks a receipt from the AI and works out what to store, without storing
 * anything yet. Throws ToolInputError for an empty receipt, two copies, a
 * file that isn't what it says, or one that's too big.
 */
export function prepareReceipt(input: ReceiptInput): PreparedReceipt {
  const email = input.email;
  const details: ReceiptDetails = {
    merchant: input.merchant || null,
    purchasedOn: input.purchased_on ?? null,
    subtotalCents:
      input.subtotal === undefined ? null : toCents(input.subtotal),
    taxCents: input.tax === undefined ? null : toCents(input.tax),
    totalCents: input.total === undefined ? null : toCents(input.total),
    rawText: input.text?.trim() || null,
    imagePathname: null,
    filePathname: null,
    fileKind: null,
    fileName: null,
    fileBytes: null,
    emailSubject: orNull(email?.subject),
    emailFrom: orNull(email?.from),
    emailDate: orNull(email?.date),
    emailMessageId: normalizeMessageId(email?.message_id),
    contentHash: null,
  };

  if (input.image_jpeg_base64 && input.pdf_base64) {
    throw new ToolInputError(
      "Send one copy of the receipt: its PDF (pdf_base64) or a JPEG (image_jpeg_base64), not both.",
    );
  }

  let image: Uint8Array | null = null;
  let file: PreparedReceipt["file"] = null;
  let fallback: string | null = null;
  const hasEmailBody = Boolean(email?.html?.trim() || email?.text?.trim());

  /*
   * A PDF or JPEG that can't be used is refused, unless the email itself was
   * sent too: then the email is saved instead, so the item still gets a
   * receipt to open, and the answer says why.
   */
  const unusable = (problem: string) => {
    if (!hasEmailBody) throw new ToolInputError(problem);
    fallback = problem;
  };

  if (input.image_jpeg_base64) {
    const jpeg = decodeBase64File(input.image_jpeg_base64, "jpeg");
    if (!jpeg) {
      unusable(
        "The image isn't a JPEG. For a PDF attachment use pdf_base64; with no attachment send the email itself as email.html or email.text.",
      );
    } else if (jpeg.length > MAX_IMAGE_BYTES) {
      unusable("The image is larger than 3MB.");
    } else {
      image = jpeg;
      details.contentHash = sha256(image);
    }
  } else if (input.pdf_base64) {
    const pdf = decodeBase64File(input.pdf_base64, "pdf");
    if (!pdf) {
      unusable(
        "That file isn't a PDF. Send the PDF attachment's bytes, base64-encoded (plain base64, base64url or a data: URL all work).",
      );
    } else if (pdf.length > MAX_PDF_BYTES) {
      unusable(
        "The PDF is larger than 3MB. Send its text and amounts instead, or the email itself.",
      );
    } else {
      file = { kind: "pdf", body: pdf, bytes: pdf.length };
      details.fileKind = "pdf";
      details.fileName = orNull(input.pdf_filename);
      details.fileBytes = pdf.length;
      details.contentHash = sha256(pdf);
    }
  }

  if (!image && !file && hasEmailBody) {
    // No attachment (or one that couldn't be used): the email itself is the receipt.
    const html = email?.html?.trim() ? email.html : null;
    const text = email?.text?.trim() ? email.text : null;
    const document = emailDocument({
      subject: details.emailSubject ?? null,
      from: details.emailFrom ?? null,
      date: details.emailDate ?? null,
      html,
      text,
    });
    const bytes = Buffer.byteLength(document, "utf8");
    file = { kind: "email", body: document, bytes };
    details.fileKind = "email";
    details.fileBytes = bytes;
    details.contentHash = sha256(`${html ?? ""}\u0000${text ?? ""}`);
  }

  const hasDetails = [
    details.merchant,
    details.purchasedOn,
    details.subtotalCents,
    details.taxCents,
    details.totalCents,
    details.rawText,
  ].some((v) => v !== null);
  if (!hasDetails && !image && !file) {
    throw new ToolInputError(
      "The receipt is empty. Send at least its total or text, and a copy: its PDF attachment, a JPEG, or the email itself when there's no attachment.",
    );
  }

  return {
    details,
    source: {
      messageId: details.emailMessageId ?? null,
      contentHash: details.contentHash ?? null,
    },
    image,
    file,
    fallback,
  };
}

/** Saves the prepared copy to the caller's own folder in the private store. */
export async function storePreparedReceipt(
  userId: string,
  prepared: PreparedReceipt,
): Promise<ReceiptDetails> {
  const details = { ...prepared.details };
  if (prepared.image) {
    details.imagePathname = newReceiptImagePathname(userId);
    await putReceiptImage(
      details.imagePathname,
      new Blob([new Uint8Array(prepared.image)], { type: IMAGE_CONTENT_TYPE }),
    );
  }
  if (prepared.file) {
    const contentType =
      prepared.file.kind === "pdf" ? PDF_CONTENT_TYPE : EMAIL_CONTENT_TYPE;
    const body = prepared.file.body;
    details.filePathname = newReceiptFilePathname(userId, prepared.file.kind);
    await putReceiptFile(
      details.filePathname,
      new Blob([typeof body === "string" ? body : new Uint8Array(body)], {
        type: contentType,
      }),
      contentType,
    );
  }
  return details;
}

/** Removes copies that were stored but not kept (or were replaced). */
export async function discardReceiptFiles(
  pathnames: (string | null | undefined)[],
) {
  await Promise.all(
    pathnames
      .filter((p): p is string => Boolean(p))
      .map((p) => deleteReceiptImage(p)),
  );
}

/** What the receipt shows, for tool answers. */
export function preparedKind(prepared: PreparedReceipt): ReceiptKind {
  if (prepared.file) return prepared.file.kind;
  return prepared.image ? "photo" : "details";
}

/**
 * The sentence a tool answer adds about the receipt it saved, including why
 * the email was saved instead of a PDF or JPEG that couldn't be used.
 */
export function receiptNote(prepared: PreparedReceipt): string {
  const saved = `Receipt attached (${receiptKindLabel(preparedKind(prepared))}).`;
  return prepared.fallback
    ? `${saved} ${prepared.fallback} The email itself was saved as the receipt instead.`
    : saved;
}

const SAVED_AS: Record<ReceiptKind, string> = {
  photo: "with its photo",
  pdf: "with its PDF",
  email: "with a copy of the email",
  details: "(details only, no copy to open)",
};

const notFound = (what: string, lookup: string): ToolResult => ({
  summary: `No ${what} with that id. Call ${lookup} to find it.`,
  data: {},
  isError: true,
});

type Target =
  | { kind: "expense"; id: string; existing: ExistingReceipt | null }
  | { kind: "pending"; id: string; existing: ExistingReceipt | null }
  | {
      kind: "fixed_bill_payment";
      fixedItemId: string;
      month: string;
      existing: ExistingReceipt | null;
    };

/** Where an attach_receipt call's receipt goes, or a tool error. */
async function findTarget(
  userId: string,
  input: {
    expense_id?: string;
    pending_id?: string;
    fixed_bill_id?: string;
    month?: string;
  },
): Promise<Target | ToolResult> {
  if (input.expense_id) {
    if (!(await selectExpenseById(userId, input.expense_id))) {
      return notFound("expense", "list_expenses");
    }
    return {
      kind: "expense",
      id: input.expense_id,
      existing: await selectExpenseReceipt(userId, input.expense_id),
    };
  }
  if (input.pending_id) {
    if (!(await selectPendingExpense(userId, input.pending_id))) {
      return notFound("pending item", "list_expenses");
    }
    return {
      kind: "pending",
      id: input.pending_id,
      existing: await selectPendingReceipt(userId, input.pending_id),
    };
  }
  const fixedItemId = String(input.fixed_bill_id);
  const month = String(input.month);
  const payment = await selectBillPaymentTarget(userId, fixedItemId, month);
  if (!payment) {
    return {
      summary: `That fixed bill isn't marked paid for ${month}. Call mark_bill_paid first (find the bill with list_fixed_bills), then attach the receipt.`,
      data: { fixed_bill_id: fixedItemId, month },
      isError: true,
    };
  }
  // A payment made by a saved expense keeps its receipt on that expense.
  if (payment.expenseId) {
    return {
      kind: "expense",
      id: payment.expenseId,
      existing: await selectExpenseReceipt(userId, payment.expenseId),
    };
  }
  return {
    kind: "fixed_bill_payment",
    fixedItemId,
    month,
    existing: payment.existing,
  };
}

const targetData = (target: Target) =>
  target.kind === "fixed_bill_payment"
    ? {
        kind: target.kind,
        fixed_bill_id: target.fixedItemId,
        month: target.month,
      }
    : { kind: target.kind, id: target.id };

/** attach_receipt: a receipt (and its copy) on an expense, pending item or bill payment. */
export async function attachReceiptFor(
  caller: Caller,
  args: unknown,
): Promise<ToolResult> {
  const input = attachReceiptInputSchema.parse(args);
  // Validate the copy and find the target first, so nothing is stored for nothing.
  const prepared = prepareReceipt(input);
  const target = await findTarget(caller.userId, input);
  if ("summary" in target) return target;

  const kind = preparedKind(prepared);
  if (
    target.existing &&
    isSameReceipt(target.existing, {
      ...prepared.source,
      reading: readingOf(prepared.details),
    })
  ) {
    return {
      summary:
        "That receipt is already attached (same email or file), so nothing changed.",
      data: {
        ...targetData(target),
        status: "already_attached",
        receipt_kind: kind,
      },
    };
  }

  const receipt = await storePreparedReceipt(caller.userId, prepared);
  const result =
    target.kind === "expense"
      ? await setExpenseReceipt(caller.userId, target.id, receipt)
      : target.kind === "pending"
        ? await setPendingReceipt(caller.userId, target.id, receipt)
        : await setBillPaymentReceipt(
            caller.userId,
            target.fixedItemId,
            target.month,
            receipt,
          );
  if (!result) {
    await discardReceiptFiles([receipt.imagePathname, receipt.filePathname]);
    return notFound("expense", "list_expenses");
  }
  await discardReceiptFiles(result.replacedFiles);
  const where =
    target.kind === "fixed_bill_payment"
      ? ` to the ${target.month} payment of that fixed bill`
      : "";
  return {
    summary: `Receipt attached${where} ${SAVED_AS[kind]}. The user can open and download it in Budget.${prepared.fallback ? ` ${prepared.fallback} The email itself was saved as the receipt instead.` : ""}`,
    data: {
      ...targetData(target),
      status: "attached",
      receipt_kind: kind,
      has_photo: receipt.imagePathname !== null,
      has_file: receipt.filePathname !== null,
      replaced: result.replacedFiles.length > 0,
      replaced_photo: result.replacedFiles.some((p) => p.endsWith(".jpg")),
      ...(prepared.fallback ? { copy_not_saved: prepared.fallback } : {}),
    },
  };
}

/** Runs `tool`, turning a ToolInputError into a tool error the AI can read. */
export async function friendly(
  tool: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await tool();
  } catch (error) {
    if (error instanceof ToolInputError) {
      return { summary: error.message, data: {}, isError: true };
    }
    throw error;
  }
}
