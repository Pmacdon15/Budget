import { PiggyBank } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSavingsGoals } from "@/dal/savings-goals";
import { formatMoney } from "@/lib/money";
import { currentMonth } from "@/lib/month";
import {
  type GoalStatus,
  goalHint,
  goalProgress,
  type SavingsGoal,
} from "@/lib/savings-goals";
import { cn } from "@/lib/utils";
import { GoalActions } from "./goal-actions";

const STATUS: Record<GoalStatus, { label: string; className: string } | null> =
  {
    reached: {
      label: "Reached",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
    },
    "on-track": {
      label: "On track",
      className:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-transparent",
    },
    behind: {
      label: "Behind",
      className:
        "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
    },
    "no-date": null,
  };

/** The user's goals as cards. Awaits the month, then reads the goals. */
export async function GoalList({
  month: monthPromise,
}: {
  month: Promise<string>;
}) {
  const month = await monthPromise;
  const goals = await getSavingsGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="No savings goals yet"
        description="Add something to save toward, like an emergency fund or a trip, and track how close you are."
      />
    );
  }

  // Pace is measured against the real current month, not the month being viewed.
  const now = currentMonth();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} month={month} now={now} />
      ))}
    </div>
  );
}

function GoalCard({
  goal,
  month,
  now,
}: {
  goal: SavingsGoal;
  month: string;
  now: string;
}) {
  const progress = goalProgress(goal, now);
  const status = STATUS[progress.status];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="truncate">{goal.name}</span>
          {status ? (
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription className="tabular-nums">
          {formatMoney(progress.savedCents)} of {formatMoney(goal.targetCents)}
        </CardDescription>
        <CardAction>
          <GoalActions month={month} goal={goal} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Progress
          value={progress.fraction * 100}
          aria-label={`${goal.name}: ${formatMoney(progress.savedCents)} of ${formatMoney(goal.targetCents)}`}
          className={cn(
            progress.status === "behind" &&
              "[&_[data-slot=progress-indicator]]:bg-amber-500",
            progress.status === "reached" &&
              "[&_[data-slot=progress-indicator]]:bg-emerald-500",
          )}
        />
        <p className="text-muted-foreground text-sm">
          {goalHint(progress, goal.targetDate)}
        </p>
      </CardContent>
    </Card>
  );
}
