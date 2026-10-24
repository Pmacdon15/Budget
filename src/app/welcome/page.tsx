import type { Metadata } from "next";
import Link from "next/link";
import { LedgerCard } from "@/components/home/ledger-card";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { categoryColor } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  SAMPLE_CATEGORIES,
  SAMPLE_EXPENSES,
  SAMPLE_FIXED,
  SAMPLE_INCOME,
  SAMPLE_MONTH,
  SAMPLE_TOTALS,
  shareOfIncome,
} from "@/lib/sample-month";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Budget — know what’s left before the month does" },
  description:
    "Enter your fixed bills once, log take-home as it lands and spending as it happens. Budget does the subtraction and gives you one page at the end of the month.",
};

const landed = SAMPLE_INCOME.filter((i) => i.amountCents !== null);

const COLUMNS = [
  {
    step: "01",
    title: "Fixed bills",
    body: "Rent, phone, insurance, subscriptions. Enter them once with a due day and they carry into every month.",
    rows: SAMPLE_FIXED.slice(0, 2).map((f) => [f.name, f.amountCents] as const),
    more: "+ add a bill",
  },
  {
    step: "02",
    title: "Take-home",
    body: "Pay lands when it lands. Log each deposit and the month keeps a running total, with a three-month average beside it.",
    rows: landed.map((i) => [i.date, i.amountCents ?? 0] as const),
    more: `So far ${formatMoney(SAMPLE_TOTALS.incomeCents)}`,
  },
  {
    step: "03",
    title: "Spending",
    body: "Groceries, gas, nights out. Log one-off purchases by category and see exactly where the rest went.",
    rows: SAMPLE_EXPENSES.slice(0, 2).map(
      (e) => [e.description, e.amountCents] as const,
    ),
    more: "+ add an expense",
  },
] as const;

export default function WelcomePage() {
  const wentOutCents = SAMPLE_TOTALS.fixedCents + SAMPLE_TOTALS.spentCents;

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div className="flex flex-col items-start gap-6">
            <Badge variant="outline" className="h-6 px-2.5">
              A monthly budget, kept like a ledger
            </Badge>
            <h1 className="text-balance font-semibold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
              Know what’s left before the month does.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Write down the bills that come every month. Add your pay as it
              lands and your spending as it happens. Budget does the subtraction
              and hands you one page at the end of the month.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Start your first month
              </Link>
              <Link
                href="#how"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "px-4",
                })}
              >
                See how it works
              </Link>
            </div>
          </div>
          <LedgerCard className="w-full max-w-lg justify-self-center lg:justify-self-end" />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
                Three columns. That’s the whole system.
              </h2>
              <p className="max-w-sm text-muted-foreground">
                No bank login and no streaks. What comes in, what’s spoken for,
                and what you spent.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {COLUMNS.map((column) => (
                <Card key={column.step}>
                  <CardHeader>
                    <span className="font-mono text-muted-foreground text-xs">
                      {column.step}
                    </span>
                    <CardTitle className="font-semibold text-xl tracking-tight">
                      {column.title}
                    </CardTitle>
                    <CardDescription className="text-pretty">
                      {column.body}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <ul className="divide-y divide-dashed border-t font-mono text-[13px] tabular-nums">
                      {column.rows.map(([label, cents]) => (
                        <li key={label} className="flex justify-between py-2">
                          <span className="font-sans">{label}</span>
                          <span>{formatMoney(cents)}</span>
                        </li>
                      ))}
                      <li className="py-2 text-muted-foreground">
                        {column.more}
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Report */}
        <section className="border-t">
          <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-4">
              <h2 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
                {SAMPLE_MONTH}, on one page.
              </h2>
              <p className="text-muted-foreground">
                The monthly report reads top to bottom: what came in, what went
                out, what was left, and how that compares with last month.
              </p>
              <ul className="grid list-disc gap-2 pl-5 text-sm marker:text-muted-foreground">
                <li>Your savings rate for the month</li>
                <li>Fixed bills and spending broken down by category</li>
                <li>Each line next to your twelve-month average</li>
                <li>Print it, or download the month as a CSV</li>
              </ul>
            </div>
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="font-semibold">
                  Monthly report — {SAMPLE_MONTH}
                </CardTitle>
                <CardDescription>Sample numbers</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <dl className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Came in", cents: SAMPLE_TOTALS.incomeCents },
                    { label: "Went out", cents: wentOutCents },
                    {
                      label: "Left",
                      cents: SAMPLE_TOTALS.leftCents,
                      highlight: true,
                    },
                  ].map(({ label, cents, highlight }) => (
                    <div key={label} className="grid gap-1">
                      <dt className="text-muted-foreground text-xs">{label}</dt>
                      <dd
                        className={cn(
                          "w-fit font-mono font-semibold tabular-nums sm:text-lg",
                          highlight &&
                            "rounded-md bg-highlight px-1.5 text-highlight-foreground",
                        )}
                      >
                        {formatMoney(cents)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <ul className="grid gap-2.5 text-sm">
                  {SAMPLE_CATEGORIES.map(({ category, totalCents }) => (
                    <li
                      key={category}
                      className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: categoryColor(category) }}
                        />
                        {category}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(shareOfIncome(totalCents) * 100, 1)}%`,
                            backgroundColor: categoryColor(category),
                          }}
                        />
                      </span>
                      <span className="text-right font-mono text-muted-foreground tabular-nums">
                        {formatPercent(shareOfIncome(totalCents))}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 md:py-24">
            <h2 className="max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-5xl">
              Start next month with a clean sheet.
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Create your account
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "px-4",
                })}
              >
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
