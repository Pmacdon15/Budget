import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { HistoryChart } from "@/components/charts/history-chart";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { YearChange } from "@/components/year-view/year-change";
import { getYearReport } from "@/dal/year-view";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { requestMonth } from "@/lib/now";
import { cn } from "@/lib/utils";
import { hasData, periodLabel, shareOf } from "@/lib/year-view";

/*
 * The year view's `<Suspense>` holes. Each one waits for the URL first, then
 * reads the (request-deduped) year report, so the shell never touches the
 * session.
 */

type YearProps = { year: Promise<number> };

async function load(yearPromise: Promise<number>) {
  const year = await yearPromise;
  return getYearReport(year);
}

const percent = (value: number | null) =>
  value === null ? "—" : formatPercent(value);

/** Previous / next year links. Next is hidden for the current year. */
export async function YearSwitcher({ year: yearPromise }: YearProps) {
  const year = await yearPromise;
  const thisYear = Number((await requestMonth()).slice(0, 4));
  const link = cn(buttonVariants({ variant: "outline" }), "print:hidden");
  return (
    <>
      <Link href={`/report/year?year=${year - 1}`} className={link}>
        <ChevronLeft /> {year - 1}
      </Link>
      {year < thisYear ? (
        <Link href={`/report/year?year=${year + 1}`} className={link}>
          {year + 1} <ChevronRight />
        </Link>
      ) : null}
    </>
  );
}

/** Which months the page covers, for the header description. */
export async function YearPeriod({ year }: YearProps) {
  const report = await load(year);
  return <>{periodLabel(report)}</>;
}

export const HEADLINES = {
  income: { label: "Take-home", icon: Wallet },
  spent: { label: "Total out", icon: Receipt },
  net: { label: "Left over", icon: PiggyBank },
  rate: { label: "Savings rate", icon: TrendingUp },
} as const;

export async function YearHeadline({
  year,
  kind,
}: YearProps & { kind: keyof typeof HEADLINES }) {
  const report = await load(year);
  const { totals, previous } = report;
  const { label, icon } = HEADLINES[kind];
  const vs = (current: number, before: number, goodWhen: "up" | "down") =>
    previous.activeMonths > 0 ? (
      <>
        <YearChange current={current} previous={before} goodWhen={goodWhen} />{" "}
        vs {periodLabel(report, -1)}
      </>
    ) : (
      `No data for ${periodLabel(report, -1)}`
    );

  if (kind === "rate") {
    const rate = shareOf(totals.netCents, totals.incomeCents);
    const before = shareOf(previous.netCents, previous.incomeCents);
    return (
      <StatCard
        label={label}
        icon={icon}
        value={percent(rate)}
        hint={
          before === null
            ? "Of take-home, after bills and spending"
            : `${percent(before)} in ${periodLabel(report, -1)}`
        }
      />
    );
  }

  const field = {
    income: "incomeCents",
    spent: "spentCents",
    net: "netCents",
  } as const;
  const key = field[kind];
  return (
    <StatCard
      label={label}
      icon={icon}
      value={formatMoney(totals[key])}
      tone={
        kind === "net"
          ? totals.netCents >= 0
            ? "positive"
            : "negative"
          : "default"
      }
      hint={vs(totals[key], previous[key], kind === "spent" ? "down" : "up")}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

export async function YearChart({ year }: YearProps) {
  const report = await load(year);
  if (report.totals.activeMonths === 0) {
    return <Empty>Nothing recorded in {report.year} yet.</Empty>;
  }
  return <HistoryChart history={report.months} />;
}

export async function YearComparison({ year }: YearProps) {
  const report = await load(year);
  const { totals, previous } = report;
  const rows = [
    ["Take-home", totals.incomeCents, previous.incomeCents, "up"],
    ["Fixed bills", totals.fixedCents, previous.fixedCents, "down"],
    ["Spending", totals.variableCents, previous.variableCents, "down"],
    ["Total out", totals.spentCents, previous.spentCents, "down"],
    ["Left over", totals.netCents, previous.netCents, "up"],
  ] as const;
  const months = Math.max(report.months.length, 1);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead className="text-right">{periodLabel(report)}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {periodLabel(report, -1)}
          </TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="hidden text-right md:table-cell">
            Monthly avg
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([label, cur, prev, good]) => (
          <TableRow key={label}>
            <TableCell className="font-medium">{label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(cur)}
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
              {formatMoney(prev)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <YearChange current={cur} previous={prev} goodWhen={good} />
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
              {formatMoney(Math.round(cur / months))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function YearBestWorst({ year }: YearProps) {
  const report = await load(year);
  const { best, worst } = report;
  if (!best || !worst) {
    return <Empty>Best and worst months show once two months have data.</Empty>;
  }
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {(
        [
          ["Best month", best],
          ["Worst month", worst],
        ] as const
      ).map(([label, m]) => (
        <div key={label} className="grid gap-1">
          <dt className="text-muted-foreground text-sm">{label}</dt>
          <dd className="font-semibold text-lg">{monthLabel(m.month)}</dd>
          <dd
            className={cn(
              "text-sm tabular-nums",
              m.netCents >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatMoney(m.netCents)} left over
          </dd>
          <dd className="text-muted-foreground text-xs tabular-nums">
            {formatMoney(m.incomeCents)} in · {formatMoney(m.spentCents)} out
          </dd>
        </div>
      ))}
    </dl>
  );
}

export async function YearMonths({ year }: YearProps) {
  const report = await load(year);
  if (report.months.length === 0) {
    return <Empty>{report.year} hasn't started yet.</Empty>;
  }
  const { totals } = report;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Take-home</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Fixed bills
          </TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Spending
          </TableHead>
          <TableHead className="text-right">Left over</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.months.map((m) => (
          <TableRow
            key={m.month}
            className={cn(!hasData(m) && "text-muted-foreground")}
          >
            <TableCell>
              <Link
                href={`/report?month=${m.month}`}
                className="font-medium hover:underline"
              >
                {monthLabel(m.month)}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(m.incomeCents)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {formatMoney(m.fixedCents)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {formatMoney(m.variableCents)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums",
                m.netCents < 0 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatMoney(m.netCents)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">Total</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatMoney(totals.incomeCents)}
          </TableCell>
          <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
            {formatMoney(totals.fixedCents)}
          </TableCell>
          <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
            {formatMoney(totals.variableCents)}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatMoney(totals.netCents)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export async function YearCategories({ year }: YearProps) {
  const report = await load(year);
  if (report.categories.length === 0) {
    return <Empty>No bills or spending in {periodLabel(report)}.</Empty>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">{periodLabel(report)}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {periodLabel(report, -1)}
          </TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="hidden text-right md:table-cell">
            % of pay
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.categories.map((c) => (
          <TableRow key={c.category}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: categoryColor(c.category) }}
                />
                {categoryLabel(c.category)}
              </div>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(c.totalCents)}
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
              {formatMoney(c.previousCents)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <YearChange
                current={c.totalCents}
                previous={c.previousCents}
                goodWhen="down"
              />
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
              {percent(shareOf(c.totalCents, report.totals.incomeCents))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
