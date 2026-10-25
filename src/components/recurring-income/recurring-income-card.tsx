import { Plus, Repeat } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
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
import { Skeleton } from "@/components/ui/skeleton";
import { getLatestIncome } from "@/dal/income";
import { getRecurringIncomeForMonth } from "@/dal/recurring-income";
import { RecurringIncomeDialog } from "./recurring-income-dialog";
import { RecurringIncomeRow } from "./recurring-income-row";

type Props = { month: Promise<string>; className?: string };

/*
 * Not async: the frame, title and description are in the static shell. The
 * set-up button and the list each wait for the month in their own hole.
 */
export function RecurringIncomeCard({ month, className }: Props) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Repeating take-home</CardTitle>
        <CardDescription>
          Optional. Paycheques you expect every month, ready to add in one tap.
          Nothing counts until you add it, so a different amount or a missed
          month is fine.
        </CardDescription>
        <CardAction>
          <Suspense fallback={<Skeleton className="h-7 w-24" />}>
            <SetUpButton month={month} />
          </Suspense>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <RecurringList month={month} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SetUpButton({ month: monthPromise }: Props) {
  const month = await monthPromise;
  const latest = await getLatestIncome();
  return (
    <RecurringIncomeDialog
      month={month}
      suggestion={
        latest ? { label: latest.label, amountCents: latest.amountCents } : null
      }
      trigger={
        <Button variant="outline" size="sm">
          <Plus /> Repeat
        </Button>
      }
    />
  );
}

async function RecurringList({ month: monthPromise }: Props) {
  const month = await monthPromise;
  const items = await getRecurringIncomeForMonth(month);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Nothing repeating"
        description="Paid the same most months? Set it to repeat and add it each month with one tap, or change the amount when it's different."
      />
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <RecurringIncomeRow key={item.id} month={month} item={item} />
      ))}
    </ul>
  );
}
