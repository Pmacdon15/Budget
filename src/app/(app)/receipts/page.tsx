import { FileArchive } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ReceiptExportDialog } from "@/components/receipt-export/receipt-export-dialog";
import {
  ReceiptLibraryCount,
  ReceiptLibraryRows,
} from "@/components/receipt-library/receipt-library-list";
import { ReceiptSearchForm } from "@/components/receipt-library/receipt-search-form";
import { ListSkeleton, TextSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monthLabel } from "@/lib/month";
import { receiptSearchFrom } from "@/lib/schemas/receipt-library";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Receipts" };

/*
 * Not async: the heading, search box and table frame are in the static shell.
 * The month name, search text, count and rows each wait in their own hole.
 */
export default function ReceiptsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);
  const search = receiptSearchFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Receipts"
        description={
          <>
            Receipts and spending documents for{" "}
            <Suspense fallback={<TextSkeleton className="w-24" />}>
              {month.then((m) => monthLabel(m))}
            </Suspense>
            .
          </>
        }
      >
        <Suspense
          fallback={
            <Button variant="outline" disabled>
              <FileArchive /> Download receipts
            </Button>
          }
        >
          {month.then((m) => (
            <ReceiptExportDialog month={m} />
          ))}
        </Suspense>
      </PageHeader>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Scanned receipts</CardTitle>
          <CardDescription>
            <Suspense fallback={<TextSkeleton className="w-40" />}>
              <ReceiptLibraryCount month={month} search={search} />
            </Suspense>
          </CardDescription>
          <Suspense fallback={<ReceiptSearchForm />}>
            {Promise.all([search, month]).then(([q, m]) => (
              <ReceiptSearchForm query={q} month={m} />
            ))}
          </Suspense>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Receipt copy and month</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Suspense
                fallback={
                  <TableRow>
                    <TableCell colSpan={4}>
                      <ListSkeleton rows={5} />
                    </TableCell>
                  </TableRow>
                }
              >
                <ReceiptLibraryRows month={month} search={search} />
              </Suspense>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
