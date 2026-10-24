"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { RowActions } from "@/components/row-actions";
import { monthLabel } from "@/lib/month";
import type { FixedItem } from "@/lib/types";
import { useStopFixedItem } from "@/mutations/fixed-items";

export function FixedItemActions({
  item,
  month,
}: {
  item: FixedItem;
  month: string;
}) {
  const stopFixedItem = useStopFixedItem();
  const startsThisMonth = item.startMonth >= month;
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
          successMessage={startsThisMonth ? "Bill deleted" : "Bill stopped"}
          mutation={stopFixedItem}
          variables={{ id: item.id, fromMonth: month }}
        />
      )}
    />
  );
}
