import type { Metadata } from "next";
import Link from "next/link";
import { LedgerCard } from "@/components/home/ledger-card";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  SAMPLE_CATEGORIES,
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

const landed = SAMPLE_INCOME.filter((i) => i.amountCents !== null).length;
const wentOutCents = SAMPLE_TOTALS.fixedCents + SAMPLE_TOTALS.spentCents;

const NUMBERS = [
  {
    label: "Came in",
    cents: SAMPLE_TOTALS.incomeCents,
    body: `Take-home, logged as each paycheque lands. ${landed} of ${SAMPLE_INCOME.length} are in so far.`,
  },
  {
    label: "Went out",
    cents: wentOutCents,
    body: `${SAMPLE_FIXED.length} fixed bills you entered once, plus whatever you spent this month, by category.`,
  },
  {
    label: "Left",
    cents: SAMPLE_TOTALS.leftCents,
    body: "Updated every time you add something. No spreadsheet, no formulas to keep fixing.",
    highlight: true,
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col items-start gap-7">
            <h1 className="font-semibold text-5xl leading-[0.95] tracking-tighter sm:text-7xl xl:text-8xl">
              Know{" "}
              <span className="box-decoration-clone rounded-md bg-highlight px-1.5 text-highlight-foreground">
                what’s left
              </span>{" "}
              before the month does.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Bills you enter once. Pay you log as it lands. Spending as it
              happens. Budget does the subtraction and hands you one page at the
              end of the month.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Start your first month
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "px-4",
                })}
              >
                Sign in
              </Link>
            </div>
          </div>
          <LedgerCard className="w-full max-w-md justify-self-center lg:justify-self-end" />
        </section>

        {/* Three numbers */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <h2 className="mb-10 max-w-3xl text-balance font-semibold text-3xl tracking-tight sm:text-5xl">
              Three numbers. That’s the whole system.
            </h2>
            <dl className="grid gap-10 md:grid-cols-3 md:gap-8">
              {NUMBERS.map((n) => (
                <div
                  key={n.label}
                  className="grid content-start gap-3 border-t pt-5"
                >
                  <dt className="font-medium text-muted-foreground text-sm">
                    {n.label}
                  </dt>
                  <dd className="grid gap-3">
                    <span
                      className={cn(
                        "w-fit font-mono font-semibold text-4xl tabular-nums tracking-tight lg:text-5xl",
                        "highlight" in n &&
                          "rounded-md bg-highlight px-2 text-highlight-foreground",
                      )}
                    >
                      {formatMoney(n.cents)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {n.body}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-muted-foreground text-xs">
              Sample {SAMPLE_MONTH}. Your numbers will be your own.
            </p>
          </div>
        </section>

        {/* Report on a muted band */}
        <section className="border-y bg-muted">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-4">
              <h2 className="text-balance font-semibold text-4xl tracking-tight sm:text-6xl">
                {SAMPLE_MONTH}, on one page.
              </h2>
              <p className="max-w-md text-muted-foreground">
                When the month closes, the report reads top to bottom: what came
                in, what went out, what was left, your savings rate, and how
                each line compares with last month and your twelve-month
                average. Print it, or download it as a CSV.
              </p>
            </div>
            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle className="font-semibold">
                  Monthly report — {SAMPLE_MONTH}
                </CardTitle>
                <CardDescription>Sample numbers</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground text-sm">
                    Savings rate
                  </span>
                  <span className="rounded-md bg-highlight px-2 font-mono font-semibold text-2xl text-highlight-foreground tabular-nums">
                    {formatPercent(shareOfIncome(SAMPLE_TOTALS.leftCents))}
                  </span>
                </div>
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
                        {categoryLabel(category)}
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
                        {formatMoney(totalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Closing */}
        <section>
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 md:py-28">
            <h2 className="max-w-4xl text-balance font-semibold text-5xl leading-[0.95] tracking-tighter sm:text-7xl">
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
