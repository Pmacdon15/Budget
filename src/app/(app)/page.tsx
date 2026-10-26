import {
  CalendarRange,
  PiggyBank,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BankBalanceCard } from "@/components/bank-balance/bank-balance-card";
import { CategoryBudgetsCard } from "@/components/budgets/category-budgets-card";
import { HistoryChart } from "@/components/charts/history-chart";
import { SpendingDonut } from "@/components/charts/spending-donut";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { PageHeader } from "@/components/page-header";
import { SafeToSpend } from "@/components/safe-to-spend";
import {
  ActionsSkeleton,
  ChartSkeleton,
  ListSkeleton,
  StatCardSkeleton,
  TextSkeleton,
} from "@/components/skeletons";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UpcomingBillsCard } from "@/components/upcoming-bills-card";
import { getLatestIncome } from "@/dal/income";
import { getMonthOverview } from "@/dal/overview";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

/*
 * Not async: everything here that doesn't depend on the request (headings,
 * card frames, labels) is in the prerendered static shell. Each piece that
 * needs the month or the user's data is its own small `<Suspense>` hole and
 * awaits there, as low in the tree as it can.
 */
export default function OverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);

  return (
    <>
      <PageHeader
        title={
          <Suspense fallback={<TextSkeleton className="w-44" />}>
            {month.then((m) => monthLabel(m))}
          </Suspense>
        }
        description="Where your money is going this month."
      >
        <Suspense fallback={<ActionsSkeleton />}>
          <HeaderActions month={month} />
        </Suspense>
      </PageHeader>

      {/* Setup steps for a brand-new user, or a take-home nudge. Usually nothing. */}
      <Suspense fallback={null}>
        <GettingStarted month={month} />
      </Suspense>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Suspense
          fallback={<StatCardSkeleton label="Take-home" icon={Wallet} />}
        >
          <TakeHomeStat month={month} />
        </Suspense>
        <Suspense
          fallback={
            <StatCardSkeleton label="Fixed bills" icon={CalendarRange} />
          }
        >
          <FixedStat month={month} />
        </Suspense>
        <Suspense
          fallback={<StatCardSkeleton label="Spending" icon={Receipt} />}
        >
          <SpendingStat month={month} />
        </Suspense>
        <Suspense
          fallback={<StatCardSkeleton label="Left over" icon={PiggyBank} />}
        >
          <LeftOverStat month={month} />
        </Suspense>
      </div>

      <BankBalanceCard month={month} />

      <SafeToSpend month={month} />

      <Suspense fallback={null}>
        <SpentBar month={month} />
      </Suspense>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Last 12 months</CardTitle>
            <CardDescription>
              Take-home vs. what went out, and what was left.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartSkeleton className="h-72" />}>
              <History month={month} />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where it went</CardTitle>
            <CardDescription>
              Fixed bills and spending by category.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartSkeleton className="h-56" />}>
              <Breakdown month={month} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <CategoryBudgetsCard month={month} className="mt-4" />

      <UpcomingBillsCard month={month} className="mt-4" />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fixed bills</CardTitle>
            <CardDescription>Ordered by due day.</CardDescription>
            <CardAction>
              <MonthLink month={month} href="/fixed">
                Manage
              </MonthLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListSkeleton />}>
              <UpcomingBills month={month} />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent spending</CardTitle>
            <CardDescription>
              The latest one-off expenses this month.
            </CardDescription>
            <CardAction>
              <MonthLink month={month} href="/expenses">
                View all
              </MonthLink>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ListSkeleton />}>
              <RecentSpending month={month} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

type MonthProp = { month: Promise<string> };

/** The overview for the selected month. Every hole shares one load per request. */
async function overviewFor(month: Promise<string>) {
  return getMonthOverview(await month);
}

const suggestionFrom = (latest: Awaited<ReturnType<typeof getLatestIncome>>) =>
  latest ? { label: latest.label, amountCents: latest.amountCents } : null;

/** A link that keeps the selected month. The plain link is in the static shell. */
function MonthLink({
  month,
  href,
  children,
}: MonthProp & { href: string; children: React.ReactNode }) {
  const className = buttonVariants({ variant: "ghost", size: "sm" });
  return (
    <Suspense
      fallback={
        <Link href={href} className={className}>
          {children}
        </Link>
      }
    >
      {month.then((m) => (
        <Link href={`${href}?month=${m}`} className={className}>
          {children}
        </Link>
      ))}
    </Suspense>
  );
}

async function HeaderActions({ month }: MonthProp) {
  // The URL first: nothing here reads the session until a request arrives.
  const m = await month;
  const latest = await getLatestIncome();
  return (
    <>
      <IncomeDialog
        month={m}
        suggestion={suggestionFrom(latest)}
        trigger={
          <Button variant="outline">
            <Wallet /> Take-home
          </Button>
        }
      />
      <ExpenseDialog
        month={m}
        trigger={
          <Button>
            <Plus /> Expense
          </Button>
        }
      />
    </>
  );
}

async function GettingStarted({ month }: MonthProp) {
  const m = await month;
  const [{ history, current }, latest] = await Promise.all([
    getMonthOverview(m),
    getLatestIncome(),
  ]);

  const isBrandNew =
    history.every((h) => h.incomeCents === 0 && h.spentCents === 0) &&
    latest === null;

  if (isBrandNew) {
    return (
      <section className="mb-6 grid gap-4" aria-labelledby="getting-started">
        <div>
          <h2
            id="getting-started"
            className="font-semibold text-lg tracking-tight"
          >
            Welcome to Budget
          </h2>
          <p className="text-muted-foreground text-sm">
            Three quick steps and you're set.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <SetupStep
            step={1}
            title="Add your take-home"
            description="What actually hits your account this month, after tax."
          >
            <IncomeDialog month={m} trigger={<Button>Add take-home</Button>} />
          </SetupStep>
          <SetupStep
            step={2}
            title="Add fixed bills"
            description="Rent, phone, insurance, subscriptions — anything that repeats monthly."
          >
            <FixedItemDialog
              month={m}
              trigger={<Button variant="outline">Add a bill</Button>}
            />
          </SetupStep>
          <SetupStep
            step={3}
            title="Log spending"
            description="Groceries, gas, nights out. Your report builds itself from here."
          >
            <ExpenseDialog
              month={m}
              trigger={<Button variant="outline">Add an expense</Button>}
            />
          </SetupStep>
        </div>
      </section>
    );
  }

  if (current.incomeCents > 0) return null;

  const suggestion = suggestionFrom(latest);
  return (
    <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle>No take-home recorded for {monthLabel(m)}</CardTitle>
        <CardDescription>
          {suggestion
            ? `Last time it was ${formatMoney(suggestion.amountCents)} from “${suggestion.label}”. Add this month's amount so your numbers are right.`
            : "Add what landed in your account this month so your numbers are right."}
        </CardDescription>
        <CardAction>
          <IncomeDialog
            month={m}
            suggestion={suggestion}
            trigger={<Button size="sm">Add take-home</Button>}
          />
        </CardAction>
      </CardHeader>
    </Card>
  );
}

async function TakeHomeStat({ month }: MonthProp) {
  const { current, previous, rollingIncomeCents } = await overviewFor(month);
  return (
    <StatCard
      label="Take-home"
      icon={Wallet}
      value={formatMoney(current.incomeCents)}
      hint={
        rollingIncomeCents > 0 ? (
          <>3-mo avg {formatMoney(rollingIncomeCents)}</>
        ) : (
          <Delta
            current={current.incomeCents}
            previous={previous.incomeCents}
            goodWhen="up"
          />
        )
      }
    />
  );
}

async function FixedStat({ month }: MonthProp) {
  const { current, fixedItems } = await overviewFor(month);
  return (
    <StatCard
      label="Fixed bills"
      icon={CalendarRange}
      value={formatMoney(current.fixedCents)}
      hint={`${fixedItems.length} recurring ${fixedItems.length === 1 ? "bill" : "bills"}`}
    />
  );
}

async function SpendingStat({ month }: MonthProp) {
  const { current, previous } = await overviewFor(month);
  return (
    <StatCard
      label="Spending"
      icon={Receipt}
      value={formatMoney(current.variableCents)}
      hint={
        <Delta
          current={current.variableCents}
          previous={previous.variableCents}
          goodWhen="down"
        />
      }
    />
  );
}

async function LeftOverStat({ month }: MonthProp) {
  // Leftover spend: held to net chequing, and 0 while chequing is negative.
  const { current, leftover } = await overviewFor(month);
  const savingsRate =
    current.incomeCents > 0 ? current.netCents / current.incomeCents : 0;
  const hint =
    leftover.limitedBy === "overdrawn"
      ? "Chequing is below zero"
      : leftover.limitedBy === "chequing"
        ? "All that's in chequing"
        : current.incomeCents > 0
          ? `${formatPercent(savingsRate)} of take-home`
          : "Add take-home";
  return (
    <StatCard
      label="Left over"
      icon={current.netCents >= 0 ? PiggyBank : TrendingDown}
      value={formatMoney(current.netCents)}
      tone={
        leftover.limitedBy === "overdrawn" || current.netCents < 0
          ? "negative"
          : "positive"
      }
      hint={hint}
    />
  );
}

async function SpentBar({ month }: MonthProp) {
  const { current } = await overviewFor(month);
  if (current.incomeCents <= 0) return null;
  const usage = current.spentCents / current.incomeCents;
  return (
    <Card size="sm" className="mt-4">
      <CardContent className="grid gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {formatPercent(Math.min(usage, 9.99))} of take-home spent
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatMoney(current.spentCents)} /{" "}
            {formatMoney(current.incomeCents)}
          </span>
        </div>
        <Progress
          value={Math.min(usage * 100, 100)}
          className={cn(
            usage > 1 && "[&_[data-slot=progress-indicator]]:bg-rose-500",
            usage > 0.9 &&
              usage <= 1 &&
              "[&_[data-slot=progress-indicator]]:bg-amber-500",
          )}
        />
      </CardContent>
    </Card>
  );
}

async function History({ month }: MonthProp) {
  const { history } = await overviewFor(month);
  return <HistoryChart history={history} />;
}

async function Breakdown({ month }: MonthProp) {
  const { categories } = await overviewFor(month);
  if (categories.length > 0) return <SpendingDonut categories={categories} />;
  return (
    <EmptyState
      icon={TrendingUp}
      title="Nothing spent yet"
      description="Add a fixed bill or an expense to see the breakdown."
    />
  );
}

async function UpcomingBills({ month }: MonthProp) {
  const { month: m, fixedItems } = await overviewFor(month);
  const upcoming = [...fixedItems].sort(
    (a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99),
  );

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No fixed bills"
        description="Add the things you pay every month."
      >
        <FixedItemDialog
          month={m}
          trigger={<Button size="sm">Add a bill</Button>}
        />
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y">
      {upcoming.slice(0, 6).map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(item.category) }}
          />
          <span className="truncate font-medium">{item.name}</span>
          {item.dueDay ? (
            <Badge variant="secondary" className="tabular-nums">
              Day {item.dueDay}
            </Badge>
          ) : null}
          <span className="ml-auto tabular-nums">
            {formatMoney(item.amountCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function RecentSpending({ month }: MonthProp) {
  const { month: m, expenses } = await overviewFor(month);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No spending logged"
        description="Track one-off purchases to see the full picture."
      >
        <ExpenseDialog
          month={m}
          trigger={<Button size="sm">Add an expense</Button>}
        />
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y">
      {expenses.slice(0, 6).map((expense) => (
        <li key={expense.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(expense.category) }}
          />
          <div className="min-w-0">
            <div className="truncate font-medium">{expense.description}</div>
            <div className="text-muted-foreground text-xs">
              {categoryLabel(expense.category)} · {expense.spentOn}
            </div>
          </div>
          <span className="ml-auto tabular-nums">
            {formatMoney(expense.amountCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SetupStep({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
          {step}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
