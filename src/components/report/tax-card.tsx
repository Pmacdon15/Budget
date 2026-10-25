import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeletons";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTaxSummary } from "@/dal/tax";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { cn } from "@/lib/utils";

type Props = { month: Promise<string>; className?: string };

/*
 * Not async: the card frame, title and description are in the static shell.
 * The amounts wait for the month in their own hole.
 */
export function TaxCard({ month, className }: Props) {
  return (
    <Card className={cn("break-inside-avoid", className)}>
      <CardHeader>
        <CardTitle>GST paid</CardTitle>
        <CardDescription>
          Tax read off your scanned receipts, for the month and the year.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-4">
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <TaxSummary month={month} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function TaxSummary({ month: monthPromise }: Props) {
  const month = await monthPromise;
  const summary = await getTaxSummary(month);

  if (summary.yearReceipts === 0) {
    return (
      <p className="px-4 text-muted-foreground text-sm sm:px-0">
        No receipts with tax in {summary.year} yet. Scan a receipt when you add
        an expense and its GST shows up here.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 px-4 sm:px-0">
        <Figure
          label={monthLabel(month)}
          cents={summary.current.taxCents}
          receipts={summary.current.receipts}
        />
        <Figure
          label={`All of ${summary.year}`}
          cents={summary.yearTaxCents}
          receipts={summary.yearReceipts}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Receipts</TableHead>
            <TableHead className="text-right">GST</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.months.map((m) => (
            <TableRow
              key={m.month}
              className={cn(m.month === month && "font-medium")}
            >
              <TableCell>{monthLabel(m.month)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {m.receipts || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.taxCents ? formatMoney(m.taxCents) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">{summary.year} total</TableCell>
            <TableCell className="text-right tabular-nums">
              {summary.yearReceipts}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatMoney(summary.yearTaxCents)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function Figure({
  label,
  cents,
  receipts,
}: {
  label: string;
  cents: number;
  receipts: number;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-semibold text-2xl tabular-nums">
        {formatMoney(cents)}
      </span>
      <span className="text-muted-foreground text-xs">
        {receipts === 1 ? "1 receipt" : `${receipts} receipts`}
      </span>
    </div>
  );
}
