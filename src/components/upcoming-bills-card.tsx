import { CalendarCheck } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUpcomingBills } from "@/dal/upcoming-bills";
import { categoryColor } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { dueLabel, UPCOMING_DAYS } from "@/lib/upcoming-bills";

type Props = {
  /** The page's URL, awaited before the session so the shell never reads it. */
  month: Promise<string>;
  className?: string;
};

/*
 * Not async: the card frame and title are in the static shell. "Today" is
 * only worked out inside the hole, once a request has arrived.
 */
export function UpcomingBillsCard({ month, className }: Props) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Due soon</CardTitle>
        <CardDescription>
          Bills due in the next {UPCOMING_DAYS} days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <UpcomingBillsList month={month} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const formatDueOn = (date: string) =>
  dateFormat.format(new Date(`${date}T00:00:00Z`));

async function UpcomingBillsList({ month }: Pick<Props, "month">) {
  await month;
  const bills = await getUpcomingBills();

  if (bills.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing due this week"
        description="Bills with a due day show up here a week ahead."
      />
    );
  }

  const totalCents = bills.reduce((sum, b) => sum + b.amountCents, 0);
  return (
    <div className="grid gap-2">
      <ul className="divide-y">
        {bills.map((bill) => (
          <li
            key={`${bill.id}-${bill.dueOn}`}
            className="flex items-center gap-3 py-2.5 text-sm"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor(bill.category) }}
            />
            <div className="min-w-0">
              <div className="truncate font-medium">{bill.name}</div>
              <div className="text-muted-foreground text-xs">
                {formatDueOn(bill.dueOn)}
              </div>
            </div>
            <Badge
              variant={bill.daysAway <= 1 ? "default" : "secondary"}
              className="ml-auto"
            >
              {dueLabel(bill.daysAway)}
            </Badge>
            <span className="w-24 text-right tabular-nums">
              {formatMoney(bill.amountCents)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t pt-2 font-medium text-sm">
        <span>Total due</span>
        <span className="tabular-nums">{formatMoney(totalCents)}</span>
      </div>
    </div>
  );
}
