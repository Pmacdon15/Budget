import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ReceiptExportDialog } from "@/components/receipt-export/receipt-export-dialog";
import {
  ReceiptLibraryCount,
  ReceiptLibraryRows,
} from "@/components/receipt-library/receipt-library-list";
import { ReceiptSearchForm } from "@/components/receipt-library/receipt-search-form";
import { ListSkeleton, TextSkeleton } from "@/components/skeletons";
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
import { receiptSearchFrom } from "@/lib/schemas/receipt-library";
import type { SearchParams } from "@/lib/search-params";

export const metadata = { title: "Receipts" };

/*
 * Not async: the heading, search box and table frame are in the static shell.
 * The search text, the count and the rows each wait in their own hole.
 */
export default function ReceiptsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const search = receiptSearchFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Receipts"
        description="Every scanned receipt in one place, so you can find one for a return or warranty without remembering the month."
      >
        <ReceiptExportDialog />
      </PageHeader>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Scanned receipts</CardTitle>
          <CardDescription>
            <Suspense fallback={<TextSkeleton className="w-40" />}>
              <ReceiptLibraryCount search={search} />
            </Suspense>
          </CardDescription>
          <Suspense fallback={<ReceiptSearchForm />}>
            {search.then((q) => (
              <ReceiptSearchForm query={q} />
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
                  <span className="sr-only">Photo and month</span>
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
                <ReceiptLibraryRows search={search} />
              </Suspense>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
