import { CalendarDays, ImageOff, Paperclip } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { getReceiptLibrary } from "@/dal/receipt-library";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { RECEIPT_LIBRARY_LIMIT } from "@/lib/schemas/receipt-library";

/** The `?q=` search text, once the URL is known. */
type SearchPromise = Promise<string>;

/*
 * The receipt library's holes. Each one waits for the URL first and only then
 * reads the session and database, so the static shell never needs either.
 * Both share one read through the DAL's per-request `cache()`.
 */

/** "12 receipts" / "3 matches for “costco”", under the card title. */
export async function ReceiptLibraryCount({
  search: searchPromise,
}: {
  search: SearchPromise;
}) {
  const search = await searchPromise;
  const { receipts, truncated } = await getReceiptLibrary(search);
  const count = receipts.length;

  if (search) {
    return (
      <>
        {truncated ? `Newest ${RECEIPT_LIBRARY_LIMIT}` : count}{" "}
        {count === 1 ? "match" : "matches"} for “{search}”
      </>
    );
  }
  if (count === 0) return <>Nothing scanned yet</>;
  return (
    <>
      {truncated ? `Newest ${RECEIPT_LIBRARY_LIMIT}` : count}{" "}
      {count === 1 ? "receipt" : "receipts"}, newest first
    </>
  );
}

/** The table rows: one per receipt, even when it was split across categories. */
export async function ReceiptLibraryRows({
  search: searchPromise,
}: {
  search: SearchPromise;
}) {
  const search = await searchPromise;
  const { receipts } = await getReceiptLibrary(search);

  if (receipts.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="py-10 text-center">
          <p className="font-medium">
            {search ? "No receipts match that search" : "No receipts yet"}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {search ? (
              <>Try the merchant's name or part of the description.</>
            ) : (
              <>
                Scan a receipt on the{" "}
                <Link href="/expenses" className="underline underline-offset-4">
                  Spending
                </Link>{" "}
                page and it will be kept here.
              </>
            )}
          </p>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {receipts.map((receipt) => {
        const title =
          receipt.merchant ?? receipt.descriptions[0] ?? "Unknown merchant";
        return (
          <TableRow key={receipt.id}>
            <TableCell className="whitespace-normal">
              <div className="font-medium">{title}</div>
              {receipt.descriptions.length > 0 ? (
                <div className="mt-0.5 text-muted-foreground text-xs">
                  {receipt.descriptions.join(" · ")}
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {receipt.categories.map((category) => (
                  <Badge key={category} variant="outline">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: categoryColor(category) }}
                    />
                    {categoryLabel(category)}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="hidden tabular-nums sm:table-cell">
              {receipt.date}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="font-medium">
                {formatMoney(receipt.totalCents)}
              </div>
              {receipt.taxCents != null ? (
                <div className="text-muted-foreground text-xs">
                  {formatMoney(receipt.taxCents)} tax
                </div>
              ) : null}
              <div className="text-muted-foreground text-xs sm:hidden">
                {receipt.date}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {receipt.hasPhoto ? (
                  <a
                    href={`/api/receipts/${receipt.id}/image`}
                    target="_blank"
                    rel="noopener"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`View receipt photo for ${title}`}
                    title="View photo"
                  >
                    <Paperclip className="size-4" />
                  </a>
                ) : (
                  <span
                    className="p-1.5 text-muted-foreground/60"
                    title="No photo saved"
                  >
                    <ImageOff className="size-4" />
                  </span>
                )}
                <Link
                  href={`/expenses?month=${receipt.month}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Open ${title} in Spending`}
                  title="Open its month in Spending"
                >
                  <CalendarDays className="size-4" />
                </Link>
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
