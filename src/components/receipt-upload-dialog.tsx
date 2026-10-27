"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/compress-image";
import { formatMoney } from "@/lib/money";
import { receiptKindLabel } from "@/lib/receipt-files";
import type { UploadResponse } from "@/lib/receipt-upload";
import type { Expense } from "@/lib/types";
import { useSetExpenseAmount } from "@/mutations/expenses";

/** The app's own currency: a receipt with no stated currency is in it. */
const HOME_CURRENCY = "CAD";

/** "€145.17" for a foreign total, in the receipt's own currency. */
export function formatForeign(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Posts the file as this expense's receipt and returns what was read. */
export async function uploadReceipt(
  expenseId: string,
  file: Blob,
  name: string,
): Promise<UploadResponse> {
  const body = new FormData();
  body.append("expenseId", expenseId);
  body.append("file", file, name);
  const response = await fetch("/api/receipts/upload", {
    method: "POST",
    body,
  });
  const json = (await response.json().catch(() => null)) as
    | (UploadResponse & { error?: string })
    | null;
  if (!response.ok || !json || !json.reading) {
    throw new Error(
      json?.error ?? "That file couldn't be uploaded. Try again.",
    );
  }
  return json;
}

/**
 * A photo is shrunk to a JPEG first, as the scanner does, so a phone photo
 * fits the 3MB limit and the reader gets a size it reads well. Any other
 * file (or a photo the browser can't open) goes up as it is.
 */
async function prepare(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
    try {
      const jpeg = await compressImage(file);
      return { blob: jpeg, name: `${file.name.replace(/\.[^.]+$/, "")}.jpg` };
    } catch {
      // Not an image the browser can open (HEIC on some phones): keep the file.
    }
  }
  return { blob: file, name: file.name };
}

/**
 * "Add receipt file" for one expense: uploads a PDF, photo, email or any
 * other file as its receipt (replacing the one it has), then shows what was
 * read off it. The amount only changes when the user confirms it; a total
 * in another currency asks what was charged in CAD instead.
 */
export function ReceiptUploadDialog({
  expense,
  trigger,
}: {
  expense: Expense;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const inputId = useId();
  const amountId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [cad, setCad] = useState("");
  const setAmount = useSetExpenseAmount(expense.id);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setCad("");
    setAmount.reset();
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { blob, name } = await prepare(file);
      setResult(await uploadReceipt(expense.id, blob, name));
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That file couldn't be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  };

  const saveAmount = (amount: string) =>
    setAmount.mutate(amount, {
      onSuccess: () => {
        toast.success("Amount updated");
        onOpenChange(false);
      },
    });

  const fields = result?.reading.fields ?? {};
  const total = fields.totalCents;
  const currency = fields.currency ?? HOME_CURRENCY;
  const foreign = currency !== HOME_CURRENCY;
  const split = (result?.expense.parts ?? 1) > 1;
  const amountError = setAmount.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add receipt file</DialogTitle>
          <DialogDescription>
            {`Upload the receipt for “${expense.description}”: a PDF, a photo, the email, or any other file, up to 3MB. It replaces the receipt this expense has.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-3 text-sm" data-testid="upload-result">
            <p>Saved as the {receiptKindLabel(result.kind)}.</p>
            {result.reading.limited ? (
              <p className="text-muted-foreground">
                {result.reading.limited} It was saved without being read.
              </p>
            ) : result.reading.unreadable ? (
              <p className="text-muted-foreground">
                This kind of file can't be read, so the amount wasn't checked.
              </p>
            ) : result.reading.unavailable ? (
              <p className="text-muted-foreground">
                Reading receipts is unavailable right now, so the amount wasn't
                checked.
              </p>
            ) : total === undefined ? (
              <p className="text-muted-foreground">
                No total could be read off it.
              </p>
            ) : split ? (
              <p>
                {`It reads ${foreign ? formatForeign(total, currency) : formatMoney(total)}. This receipt covers ${result.expense.parts} split parts, so edit each part's amount yourself.`}
              </p>
            ) : foreign ? (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveAmount(cad);
                }}
              >
                <p>
                  {`It reads ${formatForeign(total, currency)} (${currency}). Enter what your card was charged in Canadian dollars.`}
                </p>
                <Label htmlFor={amountId}>Charged in CAD</Label>
                <Input
                  id={amountId}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cad}
                  onChange={(event) => setCad(event.target.value)}
                  aria-invalid={amountError ? true : undefined}
                />
                {amountError ? (
                  <p role="alert" className="text-destructive text-xs">
                    {amountError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={!cad.trim() || setAmount.isPending}
                >
                  {setAmount.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  Save amount
                </Button>
              </form>
            ) : total === result.expense.amountCents ? (
              <p>{`It reads ${formatMoney(total)}, the same as this expense.`}</p>
            ) : (
              <div className="grid gap-2">
                <p>
                  {`It reads ${formatMoney(total)}. This expense is ${formatMoney(result.expense.amountCents)}.`}
                </p>
                {amountError ? (
                  <p role="alert" className="text-destructive text-xs">
                    {amountError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  disabled={setAmount.isPending}
                  onClick={() => saveAmount((total / 100).toFixed(2))}
                >
                  {setAmount.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  {`Use ${formatMoney(total)} as the amount`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={inputId}>File</Label>
            <Input
              id={inputId}
              type="file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            {error ? (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!file || uploading}
              onClick={upload}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
