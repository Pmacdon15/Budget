import { Gauge } from "lucide-react";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getMonthOverview } from "@/dal/overview";
import { getRecurringIncomeForMonth } from "@/dal/recurring-income";
import { formatMoney } from "@/lib/money";
import { lastDayOf, today } from "@/lib/month";
import { daysLeftInMonth, safeToSpend } from "@/lib/safe-to-spend";
import { cn } from "@/lib/utils";

type Props = { month: Promise<string>; className?: string };

/**
 * The "safe to spend" number for the month being viewed. It depends on today's
 * date, so it renders only once the month and data are known: nothing in the
 * static shell, and nothing at all for a month that's already over.
 */
export function SafeToSpend(props: Props) {
  return (
    <Suspense fallback={null}>
      <SafeToSpendCard {...props} />
    </Suspense>
  );
}

const dayCount = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

async function SafeToSpendCard({ month: monthPromise, className }: Props) {
  const month = await monthPromise;
  const [{ current }, recurring] = await Promise.all([
    getMonthOverview(month),
    getRecurringIncomeForMonth(month),
  ]);

  const daysLeft = daysLeftInMonth(month, today());
  if (daysLeft === 0) return null;

  const { leftCents, perDayCents } = safeToSpend({
    incomeCents: current.incomeCents,
    spentCents: current.spentCents,
    daysLeft,
  });
  const expectedCents = recurring
    .filter((r) => r.status.state === "expected")
    .reduce((total, r) => total + r.amountCents, 0);
  const through = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${lastDayOf(month)}T00:00:00Z`));

  const noIncome = current.incomeCents <= 0;
  const over = !noIncome && leftCents <= 0;

  return (
    <Card size="sm" className={cn("mt-4", className)}>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-muted">
            <Gauge className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Safe to spend</p>
            <p
              className={cn(
                "font-semibold text-2xl tabular-nums tracking-tight",
                over && "text-rose-600 dark:text-rose-400",
              )}
            >
              {noIncome ? "—" : `${formatMoney(perDayCents)} / day`}
            </p>
          </div>
        </div>
        <div className="grid flex-1 gap-0.5 text-sm">
          <p>
            {noIncome
              ? "Add this month's take-home to see what's safe to spend."
              : over
                ? `Over by ${formatMoney(-leftCents)} this month, with ${dayCount(daysLeft)} to go.`
                : `${formatMoney(leftCents)} left for the next ${dayCount(daysLeft)}, through ${through}.`}
          </p>
          <p className="text-muted-foreground text-xs">
            Take-home minus fixed bills and spending so far.
            {expectedCents > 0
              ? ` ${formatMoney(expectedCents)} in repeating take-home isn't added yet, so it isn't counted.`
              : null}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
