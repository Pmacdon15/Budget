"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { RowActions } from "@/components/row-actions";
import { useUndoToast } from "@/components/undo-toast";
import { monthLabel } from "@/lib/month";
import type { FixedItem } from "@/lib/types";
import { useStopFixedItemWithUndo } from "@/mutations/undo";

export function FixedItemActions({
  item,
  month,
}: {
  item: FixedItem;
  month: string;
}) {
  const stopFixedItem = useStopFixedItemWithUndo();
  const showUndo = useUndoToast();
  const startsThisMonth = item.startMonth >= month;
  const done = startsThisMonth ? "Bill deleted" : "Bill stopped";
  return (
    <RowActions
      label={item.name}
      deleteLabel={startsThisMonth ? "Delete" : "Stop"}
      renderEdit={(trigger) => (
        <FixedItemDialog month={month} item={item} trigger={trigger} />
      )}
      renderDelete={(trigger) => (
        <ConfirmAction
          trigger={trigger}
          title={
            startsThisMonth ? `Delete ${item.name}?` : `Stop ${item.name}?`
          }
          description={
            startsThisMonth
              ? "This bill will be removed completely."
              : `It won't count from ${monthLabel(month)} onward. Earlier months and reports stay as they were.`
          }
          confirmLabel={startsThisMonth ? "Delete" : "Stop bill"}
          successMessage={done}
          onSuccess={(undoId) => showUndo(done, undoId)}
          mutation={stopFixedItem}
          variables={{ id: item.id, fromMonth: month }}
        />
      )}
    />
  );
}
