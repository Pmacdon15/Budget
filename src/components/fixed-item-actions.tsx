"use client";

import { stopFixedItem } from "@/app/actions";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { RowActions } from "@/components/row-actions";
import type { FixedItem } from "@/lib/data";
import { monthLabel } from "@/lib/month";

export function FixedItemActions({
  item,
  month,
}: {
  item: FixedItem;
  month: string;
}) {
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
          action={() => stopFixedItem(item.id, month)}
        />
      )}
    />
  );
}
