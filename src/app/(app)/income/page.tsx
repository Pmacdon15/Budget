import { Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { IncomeTrendChart } from "@/components/charts/income-trend-chart";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { IncomeActions } from "@/components/income-actions";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
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
import { getLatestIncome, getMonthOverview, requireUserId } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata = { title: "Take-home" };

export default function IncomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Income searchParams={searchParams} />
    </Suspense>
  );
}

async function Income({ searchParams }: { searchParams: SearchParams }) {
  const month = await monthFrom(searchParams);
  const userId = await requireUserId();
  const [overview, latest] = await Promise.all([
    getMonthOverview(month),
    getLatestIncome(userId),
  ]);
  const { current, previous, history, income, rollingIncomeCents } = overview;
  const recorded = history.filter((h) => h.incomeCents > 0);
  const suggestion = latest
    ? { label: latest.label, amountCents: latest.amountCents }
    : null;
  const highest = recorded.reduce((max, h) => Math.max(max, h.incomeCents), 0);
  const lowest = recorded.reduce(
    (min, h) => Math.min(min, h.incomeCents),
    Number.POSITIVE_INFINITY,
  );

  return (
    <>
      <PageHeader
        title="Take-home"
        description="Your net pay changes month to month — record what actually landed each month."
      >
        <IncomeDialog
          month={month}
          suggestion={suggestion}
          trigger={
            <Button>
              <Plus /> Add take-home
            </Button>
          }
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-sm">
              {monthLabel(month)}
            </span>
            <span className="font-semibold text-2xl tabular-nums">
              {formatMoney(current.incomeCents)}
            </span>
            <span className="text-muted-foreground text-xs">
              <Delta
                current={current.incomeCents}
                previous={previous.incomeCents}
                goodWhen="up"
              />
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-sm">
              Rolling 3-month average
            </span>
            <span className="font-semibold text-2xl tabular-nums">
              {formatMoney(rollingIncomeCents)}
            </span>
            <span className="text-muted-foreground text-xs">
              A steadier number to plan with
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-sm">
              Highest (12 mo)
            </span>
            <span className="font-semibold text-2xl tabular-nums">
              {formatMoney(highest)}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-sm">
              Lowest (12 mo)
            </span>
            <span className="font-semibold text-2xl tabular-nums">
              {formatMoney(Number.isFinite(lowest) ? lowest : 0)}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Take-home trend</CardTitle>
            <CardDescription>
              Monthly take-home with the rolling 3-month average.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recorded.length > 0 ? (
              <IncomeTrendChart history={history} />
            ) : (
              <EmptyState
                icon={Wallet}
                title="No take-home yet"
                description="Add this month's pay to start the trend."
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{monthLabel(month)}</CardTitle>
            <CardDescription>
              Each deposit you recorded this month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {income.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Nothing recorded"
                description={
                  suggestion
                    ? `Last entry was ${formatMoney(suggestion.amountCents)} — it'll be prefilled.`
                    : "Add each paycheque as it lands."
                }
              >
                <IncomeDialog
                  month={month}
                  suggestion={suggestion}
                  trigger={<Button size="sm">Add take-home</Button>}
                />
              </EmptyState>
            ) : (
              <ul className="divide-y">
                {income.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{entry.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {entry.receivedOn ?? "No date"}
                      </div>
                    </div>
                    <span className="ml-auto font-medium tabular-nums">
                      {formatMoney(entry.amountCents)}
                    </span>
                    <IncomeActions entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
          <CardDescription>Tap a month to view or edit it.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Take-home</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Spent
                </TableHead>
                <TableHead className="text-right">Left over</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...history].reverse().map((h) => (
                <TableRow
                  key={h.month}
                  data-state={h.month === month ? "selected" : undefined}
                >
                  <TableCell>
                    <Link
                      href={`/income?month=${h.month}`}
                      className="font-medium hover:underline"
                    >
                      {monthLabel(h.month)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.incomeCents > 0 ? (
                      formatMoney(h.incomeCents)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatMoney(h.spentCents)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      h.netCents < 0 && "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {formatMoney(h.netCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
