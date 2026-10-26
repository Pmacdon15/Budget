import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPendingAccounts } from "@/dal/accounts";
import { getPendingExpenses } from "@/dal/pending-expenses";
import {
  accountSubtitle,
  isDebtType,
  type PendingAccount,
  dateLabel as statementDate,
} from "@/lib/accounts";
import { categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import { PendingAccountActions } from "./pending-account-actions";
import { PendingActions } from "./pending-actions";

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const day = (date: string) => dateLabel.format(new Date(`${date}T00:00:00Z`));

/**
 * What AI apps submitted, waiting for approval: new accounts they proposed,
 * then expenses. Waits for the URL, then reads.
 */
export async function PendingList({ month }: { month: Promise<string> }) {
  await month;
  const [items, accounts] = await Promise.all([
    getPendingExpenses(),
    getPendingAccounts(),
  ]);
  const count = items.length + accounts.length;

  if (count === 0) {
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
        {count === 1
          ? "1 item is waiting for you."
          : `${count} items are waiting for you.`}
      </p>
      {accounts.map((account) => (
        <PendingAccountRow key={account.id} item={account} />
      ))}
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
            {item.unpaid ? <Badge variant="outline">Not paid yet</Badge> : null}
            {item.hasReceipt ? (
              <Badge variant="outline">Receipt attached</Badge>
            ) : null}
            {item.fixedItemId ? (
              <Badge variant="outline">
                Pays {item.fixedItemName ?? "a fixed bill"}
                {item.fixedItemAmountCents != null
                  ? ` (${item.fixedItemIsEstimate ? "est. " : ""}${formatMoney(item.fixedItemAmountCents)})`
                  : ""}
              </Badge>
            ) : item.isSubscription ? (
              <Badge variant="outline">
                Subscription: becomes a fixed bill
              </Badge>
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

/** An account the AI proposed, from a statement for an account Budget doesn't know. */
function PendingAccountRow({ item }: { item: PendingAccount }) {
  const balance = item.balanceCents ?? item.statementBalanceCents;
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{item.name}</span>
            <Badge variant="secondary">New account</Badge>
            {item.statementClosingDate ? (
              <Badge variant="outline">
                Statement {statementDate(item.statementClosingDate)}
              </Badge>
            ) : null}
            {item.hasStatementPdf ? (
              <Badge variant="outline">PDF attached</Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm">
            {accountSubtitle(item)}
            {item.client ? ` · from ${item.client}` : ""}
          </p>
          {item.source ? (
            <p className="truncate text-muted-foreground text-xs">
              {item.source}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {balance != null ? (
            <p className="font-semibold tabular-nums">
              {formatMoney(balance)}
              {isDebtType(item.type) ? (
                <span className="font-normal text-muted-foreground text-xs">
                  {" "}
                  owed
                </span>
              ) : null}
            </p>
          ) : null}
          <PendingAccountActions item={item} />
        </div>
      </CardContent>
    </Card>
  );
}
