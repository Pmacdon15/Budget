import { Settings2, Target } from "lucide-react";
import { Suspense } from "react";
import { CategoryBudgetsDialog } from "@/components/budgets/category-budgets-dialog";
import { EmptyState } from "@/components/empty-state";
import { RolloverButton } from "@/components/rollover/rollover-button";
import { ListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudgetProgress, getCategoryLimits } from "@/dal/category-budgets";
import { getRolloverAmounts } from "@/dal/rollover";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { budgetStatus } from "@/lib/category-budgets";
import { formatMoney } from "@/lib/money";
import { applyRollover, type RolledProgress } from "@/lib/rollover";
import { cn } from "@/lib/utils";

type Props = {
  month: Promise<string>;
  /** Match the page's own overview read so the two share one load. */
  historyMonths?: number;
  className?: string;
};

/*
 * Not async: the card frame and title are in the static shell. The "Set
 * budgets" button and the list each wait for the month in their own hole.
 */
export function CategoryBudgetsCard({
  month,
  historyMonths,
  className,
}: Props) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Category budgets</CardTitle>
        <CardDescription>
          Monthly limits, counting fixed bills and spending.
        </CardDescription>
        <CardAction className="flex gap-1">
          <Suspense fallback={null}>
            <RolloverButton month={month} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-7 w-28" />}>
            <SetBudgetsButton month={month} />
          </Suspense>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <BudgetList month={month} historyMonths={historyMonths} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SetBudgetsButton({ month: monthPromise }: Props) {
  const month = await monthPromise;
  const limits = await getCategoryLimits(month);
  return (
    <CategoryBudgetsDialog
      month={month}
      limits={limits}
      trigger={
        <Button variant="outline" size="sm">
          <Settings2 /> {limits.length > 0 ? "Edit budgets" : "Set budgets"}
        </Button>
      }
    />
  );
}

async function BudgetList({ month: monthPromise, historyMonths }: Props) {
  const month = await monthPromise;
  const [budgets, rollover] = await Promise.all([
    getBudgetProgress(month, historyMonths),
    getRolloverAmounts(month),
  ]);
  const progress = applyRollover(budgets, rollover);

  if (progress.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No budgets yet"
        description="Set a monthly limit for the categories you want to watch, like groceries or dining, and see how close you are."
      />
    );
  }

  return (
    <ul className="grid gap-4">
      {progress.map((row) => (
        <BudgetRow key={row.category} row={row} />
      ))}
    </ul>
  );
}

function BudgetRow({ row }: { row: RolledProgress }) {
  const status = budgetStatus({
    spentCents: row.spentCents,
    limitCents: row.availableCents,
  });
  const percent =
    row.availableCents > 0
      ? Math.min((row.spentCents / row.availableCents) * 100, 100)
      : row.spentCents > 0
        ? 100
        : 0;

  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(row.category) }}
          />
          <span className="truncate">{categoryLabel(row.category)}</span>
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {formatMoney(row.spentCents)} / {formatMoney(row.limitCents)}
          {row.carriedCents > 0
            ? ` + ${formatMoney(row.carriedCents)} rolled over`
            : null}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`${categoryLabel(row.category)}: ${formatMoney(row.spentCents)} of ${formatMoney(row.availableCents)}`}
        className={cn(
          status === "over" && "[&_[data-slot=progress-indicator]]:bg-rose-500",
          status === "near" &&
            "[&_[data-slot=progress-indicator]]:bg-amber-500",
        )}
      />
      <p
        className={cn(
          "text-muted-foreground text-xs tabular-nums",
          status === "over" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {row.leftCents >= 0
          ? `${formatMoney(row.leftCents)} left`
          : `${formatMoney(-row.leftCents)} over`}
        {row.fixedCents > 0
          ? ` · includes ${formatMoney(row.fixedCents)} in fixed bills`
          : null}
      </p>
    </li>
  );
}
