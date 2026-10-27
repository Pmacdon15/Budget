import { Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { IncomeTrendChart } from "@/components/charts/income-trend-chart";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { IncomeActions } from "@/components/income-actions";
import { PageHeader } from "@/components/page-header";
import { ReceiptLinks, receiptFileHref } from "@/components/receipt-links";
import { RecurringIncomeCard } from "@/components/recurring-income/recurring-income-card";
import {
  ActionsSkeleton,
  ChartSkeleton,
  ListSkeleton,
  StatCardSkeleton,
  TextSkeleton,
} from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLatestIncome } from "@/dal/income";
import { getMonthOverview } from "@/dal/overview";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata = { title: "Take-home" };

type MonthProp = { month: Promise<string> };

/*
 * Not async: headings, card frames and labels are in the static shell. Each
 * number, list and chart waits in its own small `<Suspense>` hole.
 */
export default function IncomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);
  const monthName = (
    <Suspense fallback={<TextSkeleton className="w-28" />}>
      {month.then((m) => monthLabel(m))}
    </Suspense>
  );

  return (
    <>
      <PageHeader
        title="Take-home"
        description="Your net pay changes month to month — record what actually landed each month."
      >
        <Suspense fallback={<ActionsSkeleton count={1} />}>
          <AddTakeHome month={month} />
        </Suspense>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Suspense fallback={<StatCardSkeleton label={monthName} />}>
          <MonthTotal month={month} />
        </Suspense>
        <Suspense
          fallback={<StatCardSkeleton label="Rolling 3-month average" />}
        >
          <RollingAverage month={month} />
        </Suspense>
        <Suspense fallback={<StatCardSkeleton label="Highest (12 mo)" />}>
          <Extreme month={month} pick="highest" />
        </Suspense>
        <Suspense fallback={<StatCardSkeleton label="Lowest (12 mo)" />}>
          <Extreme month={month} pick="lowest" />
        </Suspense>
      </div>

      <RecurringIncomeCard month={month} className="mt-6" />

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Take-home trend</CardTitle>
            <CardDescription>
              Monthly take-home with the rolling 3-month average.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartSkeleton />}>
              <Trend month={month} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{monthName}</CardTitle>
            <CardDescription>
              Each deposit you recorded this month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListSkeleton rows={3} />}>
              <Deposits month={month} />
            </Suspense>
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
            <Suspense fallback={<TableRowsSkeleton />}>
              <MonthByMonth month={month} />
            </Suspense>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

/** The overview for the selected month. Every hole shares one load per request. */
async function overviewFor(month: Promise<string>) {
  return getMonthOverview(await month);
}

async function suggestionFor() {
  const latest = await getLatestIncome();
  return latest
    ? { label: latest.label, amountCents: latest.amountCents }
    : null;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-semibold text-2xl tabular-nums">{value}</span>
        {hint ? (
          <span className="text-muted-foreground text-xs">{hint}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function AddTakeHome({ month }: MonthProp) {
  // The URL first: nothing here reads the session until a request arrives.
  const m = await month;
  const suggestion = await suggestionFor();
  return (
    <IncomeDialog
      month={m}
      suggestion={suggestion}
      trigger={
        <Button>
          <Plus /> Add take-home
        </Button>
      }
    />
  );
}

async function MonthTotal({ month }: MonthProp) {
  const { month: m, current, previous } = await overviewFor(month);
  return (
    <Stat
      label={monthLabel(m)}
      value={formatMoney(current.incomeCents)}
      hint={
        <Delta
          current={current.incomeCents}
          previous={previous.incomeCents}
          goodWhen="up"
        />
      }
    />
  );
}

async function RollingAverage({ month }: MonthProp) {
  const { rollingIncomeCents } = await overviewFor(month);
  return (
    <Stat
      label="Rolling 3-month average"
      value={formatMoney(rollingIncomeCents)}
      hint="A steadier number to plan with"
    />
  );
}

async function Extreme({
  month,
  pick,
}: MonthProp & { pick: "highest" | "lowest" }) {
  const { history } = await overviewFor(month);
  const recorded = history
    .filter((h) => h.incomeCents > 0)
    .map((h) => h.incomeCents);
  const value =
    recorded.length === 0
      ? 0
      : pick === "highest"
        ? Math.max(...recorded)
        : Math.min(...recorded);
  return (
    <Stat
      label={pick === "highest" ? "Highest (12 mo)" : "Lowest (12 mo)"}
      value={formatMoney(value)}
    />
  );
}

async function Trend({ month }: MonthProp) {
  const { history } = await overviewFor(month);
  if (history.some((h) => h.incomeCents > 0)) {
    return <IncomeTrendChart history={history} />;
  }
  return (
    <EmptyState
      icon={Wallet}
      title="No take-home yet"
      description="Add this month's pay to start the trend."
    />
  );
}

async function Deposits({ month }: MonthProp) {
  const m = await month;
  const [{ income }, suggestion] = await Promise.all([
    getMonthOverview(m),
    suggestionFor(),
  ]);

  if (income.length === 0) {
    return (
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
          month={m}
          suggestion={suggestion}
          trigger={<Button size="sm">Add take-home</Button>}
        />
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y">
      {income.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{entry.label}</span>
              {entry.receiptId && entry.receiptKind ? (
                <ReceiptLinks
                  href={receiptFileHref(entry.receiptId, entry.receiptKind)}
                  photoHref={`/api/receipts/${entry.receiptId}/image`}
                  kind={entry.receiptKind}
                  label={entry.label}
                />
              ) : null}
            </div>
            <div className="text-muted-foreground text-xs">
              {entry.receivedOn ?? "No date"}
              {entry.payer && entry.payer !== entry.label
                ? ` · ${entry.payer}`
                : ""}
            </div>
          </div>
          <span className="ml-auto font-medium tabular-nums">
            {formatMoney(entry.amountCents)}
          </span>
          <IncomeActions entry={entry} />
        </li>
      ))}
    </ul>
  );
}

function TableRowsSkeleton() {
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <TableRow key={i}>
          <TableCell colSpan={4}>
            <Skeleton className="h-5" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

async function MonthByMonth({ month }: MonthProp) {
  const { month: m, history } = await overviewFor(month);
  return (
    <TableBody>
      {[...history].reverse().map((h) => (
        <TableRow
          key={h.month}
          data-state={h.month === m ? "selected" : undefined}
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
  );
}
