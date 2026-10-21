import { Download, FileText } from "lucide-react";
import { Suspense } from "react";
import { CategoryBars } from "@/components/charts/category-bars";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
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
import { categoryColor } from "@/lib/categories";
import { getMonthOverview } from "@/lib/data";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata = { title: "Monthly report" };

export default function ReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

function Change({
  current,
  previous,
  goodWhen,
}: {
  current: number;
  previous: number;
  goodWhen: "up" | "down";
}) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground">—</span>;
  const good = goodWhen === "up" ? diff > 0 : diff < 0;
  return (
    <span
      className={
        good
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }
    >
      {diff > 0 ? "+" : "−"}
      {formatMoney(Math.abs(diff))}
    </span>
  );
}

async function Report({ searchParams }: { searchParams: SearchParams }) {
  const month = await monthFrom(searchParams);
  const overview = await getMonthOverview(month);
  const {
    current,
    previous,
    categories,
    fixedItems,
    expenses,
    income,
    history,
  } = overview;
  const hasData = current.incomeCents > 0 || current.spentCents > 0;
  const pct = (cents: number) =>
    current.incomeCents > 0 ? formatPercent(cents / current.incomeCents) : "—";

  // 12-month averages for context (only months with data).
  const active = history.filter((h) => h.incomeCents > 0 || h.spentCents > 0);
  const avg = (pick: (h: (typeof history)[number]) => number) =>
    active.length > 0
      ? Math.round(active.reduce((a, h) => a + pick(h), 0) / active.length)
      : 0;

  const summary = [
    {
      label: "Take-home",
      cur: current.incomeCents,
      prev: previous.incomeCents,
      avg: avg((h) => h.incomeCents),
      good: "up" as const,
    },
    {
      label: "Fixed bills",
      cur: current.fixedCents,
      prev: previous.fixedCents,
      avg: avg((h) => h.fixedCents),
      good: "down" as const,
    },
    {
      label: "Spending",
      cur: current.variableCents,
      prev: previous.variableCents,
      avg: avg((h) => h.variableCents),
      good: "down" as const,
    },
    {
      label: "Total out",
      cur: current.spentCents,
      prev: previous.spentCents,
      avg: avg((h) => h.spentCents),
      good: "down" as const,
    },
    {
      label: "Left over",
      cur: current.netCents,
      prev: previous.netCents,
      avg: avg((h) => h.netCents),
      good: "up" as const,
    },
  ];

  return (
    <>
      <PageHeader
        title={`${monthLabel(month)} report`}
        description="A full summary of the month: income, bills, spending and what was left."
      >
        <a
          href={`/report/csv?month=${month}`}
          className={cn(buttonVariants({ variant: "outline" }), "print:hidden")}
        >
          <Download /> CSV
        </a>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </PageHeader>

      {!hasData ? (
        <EmptyState
          icon={FileText}
          title="Nothing to report yet"
          description={`Add take-home, fixed bills or spending for ${monthLabel(month)} and your report will appear here.`}
        />
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Headline
              label="Take-home"
              value={formatMoney(current.incomeCents)}
            />
            <Headline
              label="Total out"
              value={formatMoney(current.spentCents)}
            />
            <Headline
              label="Left over"
              value={formatMoney(current.netCents)}
              tone={current.netCents >= 0 ? "positive" : "negative"}
            />
            <Headline label="Savings rate" value={pct(current.netCents)} />
          </div>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                Compared with {monthLabel(previous.month)} and your 12-month
                average.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead className="text-right">This month</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Last month
                    </TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      12-mo avg
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.cur)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                        {formatMoney(row.prev)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Change
                          current={row.cur}
                          previous={row.prev}
                          goodWhen={row.good}
                        />
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                        {formatMoney(row.avg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {categories.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="break-inside-avoid">
                <CardHeader>
                  <CardTitle>By category</CardTitle>
                  <CardDescription>
                    Fixed bills and spending combined.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryBars categories={categories} />
                </CardContent>
              </Card>
              <Card className="break-inside-avoid">
                <CardHeader>
                  <CardTitle>Category breakdown</CardTitle>
                  <CardDescription>
                    Share of take-home in each category.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">
                          Fixed
                        </TableHead>
                        <TableHead className="hidden text-right sm:table-cell">
                          Spending
                        </TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">% of pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2.5 rounded-full"
                                style={{
                                  backgroundColor: categoryColor(c.category),
                                }}
                              />
                              {c.category}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {c.fixedCents ? formatMoney(c.fixedCents) : "—"}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {c.variableCents
                              ? formatMoney(c.variableCents)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoney(c.totalCents)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums">
                            {pct(c.totalCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <LineItems
              title="Take-home"
              empty="No take-home recorded."
              total={current.incomeCents}
              rows={income.map((i) => ({
                id: i.id,
                name: i.label,
                detail: i.receivedOn ?? "",
                amount: i.amountCents,
              }))}
            />
            <LineItems
              title="Fixed bills"
              empty="No fixed bills this month."
              total={current.fixedCents}
              rows={[...fixedItems]
                .sort((a, b) => b.amountCents - a.amountCents)
                .map((f) => ({
                  id: f.id,
                  name: f.name,
                  detail: f.dueDay
                    ? `${f.category} · day ${f.dueDay}`
                    : f.category,
                  amount: f.amountCents,
                }))}
            />
          </div>
          <LineItems
            title="Spending"
            empty="No one-off spending this month."
            total={current.variableCents}
            rows={expenses.map((e) => ({
              id: e.id,
              name: e.description,
              detail: `${e.spentOn} · ${e.category}`,
              amount: e.amountCents,
            }))}
          />
        </div>
      )}
    </>
  );
}

function Headline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card size="sm" className="break-inside-avoid">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span
          className={cn(
            "font-semibold text-2xl tabular-nums",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "negative" && "text-rose-600 dark:text-rose-400",
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function LineItems({
  title,
  empty,
  total,
  rows,
}: {
  title: string;
  empty: string;
  total: number;
  rows: { id: string; name: string; detail: string; amount: number }[];
}) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 sm:px-4">
        {rows.length === 0 ? (
          <p className="px-4 text-muted-foreground text-sm sm:px-0">{empty}</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.detail ? (
                      <div className="text-muted-foreground text-xs">
                        {row.detail}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
