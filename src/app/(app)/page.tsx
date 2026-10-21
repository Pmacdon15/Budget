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
import { HistoryChart } from "@/components/charts/history-chart";
import { SpendingDonut } from "@/components/charts/spending-donut";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
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
import { categoryColor } from "@/lib/categories";
import { getLatestIncome, getMonthOverview, requireUserId } from "@/lib/data";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export default function OverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const month = await monthFrom(searchParams);
  const userId = await requireUserId();
  const [overview, latestIncome] = await Promise.all([
    getMonthOverview(month),
    getLatestIncome(userId),
  ]);
  const {
    current,
    previous,
    history,
    categories,
    fixedItems,
    expenses,
    rollingIncomeCents,
  } = overview;
  const query = `?month=${month}`;

  const isBrandNew =
    history.every((h) => h.incomeCents === 0 && h.spentCents === 0) &&
    latestIncome === null;

  if (isBrandNew) {
    return (
      <>
        <PageHeader
          title="Welcome to Budget"
          description="Three quick steps and you're set."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <SetupStep
            step={1}
            title="Add your take-home"
            description="What actually hits your account this month, after tax."
          >
            <IncomeDialog
              month={month}
              trigger={<Button>Add take-home</Button>}
            />
          </SetupStep>
          <SetupStep
            step={2}
            title="Add fixed bills"
            description="Rent, phone, insurance, subscriptions — anything that repeats monthly."
          >
            <FixedItemDialog
              month={month}
              trigger={<Button variant="outline">Add a bill</Button>}
            />
          </SetupStep>
          <SetupStep
            step={3}
            title="Log spending"
            description="Groceries, gas, nights out. Your report builds itself from here."
          >
            <ExpenseDialog
              month={month}
              trigger={<Button variant="outline">Add an expense</Button>}
            />
          </SetupStep>
        </div>
      </>
    );
  }

  const usage =
    current.incomeCents > 0 ? current.spentCents / current.incomeCents : 0;
  const savingsRate =
    current.incomeCents > 0 ? current.netCents / current.incomeCents : 0;
  const upcoming = [...fixedItems].sort(
    (a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99),
  );
  const suggestion = latestIncome
    ? { label: latestIncome.label, amountCents: latestIncome.amountCents }
    : null;

  return (
    <>
      <PageHeader
        title={monthLabel(month)}
        description="Where your money is going this month."
      >
        <IncomeDialog
          month={month}
          suggestion={suggestion}
          trigger={
            <Button variant="outline">
              <Wallet /> Take-home
            </Button>
          }
        />
        <ExpenseDialog
          month={month}
          trigger={
            <Button>
              <Plus /> Expense
            </Button>
          }
        />
      </PageHeader>

      {current.incomeCents === 0 ? (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle>No take-home recorded for {monthLabel(month)}</CardTitle>
            <CardDescription>
              {suggestion
                ? `Last time it was ${formatMoney(suggestion.amountCents)} from “${suggestion.label}”. Add this month's amount so your numbers are right.`
                : "Add what landed in your account this month so your numbers are right."}
            </CardDescription>
            <CardAction>
              <IncomeDialog
                month={month}
                suggestion={suggestion}
                trigger={<Button size="sm">Add take-home</Button>}
              />
            </CardAction>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        <StatCard
          label="Fixed bills"
          icon={CalendarRange}
          value={formatMoney(current.fixedCents)}
          hint={`${fixedItems.length} recurring ${fixedItems.length === 1 ? "bill" : "bills"}`}
        />
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
        <StatCard
          label="Left over"
          icon={current.netCents >= 0 ? PiggyBank : TrendingDown}
          value={formatMoney(current.netCents)}
          tone={current.netCents >= 0 ? "positive" : "negative"}
          hint={
            current.incomeCents > 0
              ? `${formatPercent(savingsRate)} of take-home`
              : "Add take-home"
          }
        />
      </div>

      {current.incomeCents > 0 ? (
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
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Last 12 months</CardTitle>
            <CardDescription>
              Take-home vs. what went out, and what was left.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HistoryChart history={history} />
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
            {categories.length > 0 ? (
              <SpendingDonut categories={categories} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Nothing spent yet"
                description="Add a fixed bill or an expense to see the breakdown."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fixed bills</CardTitle>
            <CardDescription>Ordered by due day.</CardDescription>
            <CardAction>
              <Link
                href={`/fixed${query}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Manage
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {upcoming.length > 0 ? (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
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
            ) : (
              <EmptyState
                icon={CalendarRange}
                title="No fixed bills"
                description="Add the things you pay every month."
              >
                <FixedItemDialog
                  month={month}
                  trigger={<Button size="sm">Add a bill</Button>}
                />
              </EmptyState>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent spending</CardTitle>
            <CardDescription>
              The latest one-off expenses this month.
            </CardDescription>
            <CardAction>
              <Link
                href={`/expenses${query}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                View all
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {expenses.length > 0 ? (
              <ul className="divide-y">
                {expenses.slice(0, 6).map((expense) => (
                  <li
                    key={expense.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: categoryColor(expense.category),
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {expense.description}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {expense.category} · {expense.spentOn}
                      </div>
                    </div>
                    <span className="ml-auto tabular-nums">
                      {formatMoney(expense.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No spending logged"
                description="Track one-off purchases to see the full picture."
              >
                <ExpenseDialog
                  month={month}
                  trigger={<Button size="sm">Add an expense</Button>}
                />
              </EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </>
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
