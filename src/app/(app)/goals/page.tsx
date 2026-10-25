import { Plus } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { GoalDialog } from "@/components/savings-goals/goal-dialog";
import { GoalList } from "@/components/savings-goals/goal-list";
import { ActionsSkeleton, SplitCardsSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Savings goals" };

/*
 * Not async: the heading and description are in the static shell. The add
 * button and the goals each wait for the month in their own `<Suspense>` hole.
 */
export default function GoalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Savings goals"
        description="What you're saving toward. Money you add is saved as Savings spending, so it counts as set aside that month."
      >
        <Suspense fallback={<ActionsSkeleton count={1} />}>
          {month.then((m) => (
            <GoalDialog
              month={m}
              trigger={
                <Button>
                  <Plus /> Add goal
                </Button>
              }
            />
          ))}
        </Suspense>
      </PageHeader>

      <Suspense fallback={<SplitCardsSkeleton />}>
        <GoalList month={month} />
      </Suspense>
    </>
  );
}
