"use client";

import { Plus } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import type { SavingsGoal } from "@/lib/savings-goals";
import { useDeleteSavingsGoal } from "@/mutations/savings-goals";
import { ContributeDialog } from "./contribute-dialog";
import { GoalDialog } from "./goal-dialog";

/** "Add money" plus the goal's Edit / Delete menu. */
export function GoalActions({
  month,
  goal,
}: {
  month: string;
  goal: SavingsGoal;
}) {
  const deleteGoal = useDeleteSavingsGoal();
  return (
    <div className="flex items-center gap-1">
      <ContributeDialog
        month={month}
        goal={goal}
        trigger={
          <Button size="sm" variant="outline">
            <Plus /> Add money
          </Button>
        }
      />
      <RowActions
        label={goal.name}
        renderEdit={(trigger) => (
          <GoalDialog month={month} goal={goal} trigger={trigger} />
        )}
        renderDelete={(trigger) => (
          <ConfirmAction
            trigger={trigger}
            title="Delete this goal?"
            description={`“${goal.name}” will be removed. Money you put toward it stays in your spending as Savings.`}
            confirmLabel="Delete"
            successMessage="Goal deleted"
            mutation={deleteGoal}
            variables={goal.id}
          />
        )}
      />
    </div>
  );
}
