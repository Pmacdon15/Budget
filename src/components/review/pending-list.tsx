import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import { PendingActions } from "./pending-actions";

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const day = (date: string) => dateLabel.format(new Date(`${date}T00:00:00Z`));

/** What AI apps submitted, waiting for approval. Waits for the URL, then reads. */
export async function PendingList({ month }: { month: Promise<string> }) {
  await month;
  const items = await getPendingExpenses();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="When your AI assistant finds a bill, receipt or order in your email, it shows up here for you to approve before it counts."
      />
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        {items.length === 1
          ? "1 item is waiting for you."
          : `${items.length} items are waiting for you.`}
      </p>
      {items.map((item) => (
        <PendingRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function PendingRow({ item }: { item: PendingExpense }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{item.description}</span>
            <Badge variant="secondary">{categoryLabel(item.category)}</Badge>
            {item.possibleDuplicate ? (
              <Badge variant="outline">Possible duplicate</Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm">
            {day(item.spentOn)}
            {item.merchant && item.merchant !== item.description
              ? ` · ${item.merchant}`
              : ""}
            {item.client ? ` · from ${item.client}` : ""}
          </p>
          {item.source ? (
            <p className="truncate text-muted-foreground text-xs">
              {item.source}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-semibold tabular-nums">
            {formatMoney(item.amountCents)}
          </p>
          <PendingActions item={item} />
        </div>
      </CardContent>
    </Card>
  );
}
