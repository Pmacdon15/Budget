import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import {
  pendingReceiptFileHref,
  ReceiptLinks,
} from "@/components/receipt-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAccounts, getPendingAccounts } from "@/dal/accounts";
import { getPendingExpenses } from "@/dal/pending-expenses";
import { getPendingIncome } from "@/dal/pending-income";
import {
  accountSubtitle,
  isDebtType,
  type PendingAccount,
  dateLabel as statementDate,
} from "@/lib/accounts";
import { categoryLabel } from "@/lib/categories";
import { needsAccountChoice } from "@/lib/expense-accounts";
import { formatMoney } from "@/lib/money";
import type { PendingExpense } from "@/lib/pending-expenses";
import type { PendingIncome } from "@/lib/pending-income";
import { PendingAccountActions } from "./pending-account-actions";
import { PendingActions } from "./pending-actions";
import { PendingIncomeActions } from "./pending-income-actions";

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const day = (date: string) => dateLabel.format(new Date(`${date}T00:00:00Z`));

/**
 * What AI apps submitted, waiting for approval: new accounts they proposed,
 * then income, then expenses. Waits for the URL, then reads.
 */
export async function PendingList({ month }: { month: Promise<string> }) {
  await month;
  const [items, accounts, income, existing] = await Promise.all([
    getPendingExpenses(),
    getPendingAccounts(),
    getPendingIncome(),
    getAccounts(),
  ]);
  // With several accounts, each expense must say which one paid.
  const askAccount = needsAccountChoice(existing);
  const count = items.length + accounts.length + income.length;

  if (count === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="When your AI assistant finds a bill, receipt, order or payment you received in your email, it shows up here for you to approve before it counts."
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
      {income.map((item) => (
        <PendingIncomeRow key={item.id} item={item} />
      ))}
      {items.map((item) => (
        <PendingRow key={item.id} item={item} askAccount={askAccount} />
      ))}
    </div>
  );
}

function PendingRow({
  item,
  askAccount,
}: {
  item: PendingExpense;
  /** The user has several accounts, so the one it came out of must be chosen. */
  askAccount: boolean;
}) {
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
            {askAccount && !item.accountName ? (
              <Badge variant="destructive">Choose an account</Badge>
            ) : null}
            {item.hasReceipt ? (
              <Badge variant="outline">
                Receipt attached
                {item.receiptKind && item.receiptKind !== "details" ? (
                  <ReceiptLinks
                    href={pendingReceiptFileHref(item.id, item.receiptKind)}
                    kind={item.receiptKind}
                    label={item.description}
                  />
                ) : null}
              </Badge>
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
            {item.accountName ? ` · paid from ${item.accountName}` : ""}
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

/** Money the user received (an e-Transfer, a deposit), to add to take-home. */
function PendingIncomeRow({ item }: { item: PendingIncome }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{item.label}</span>
            <Badge variant="secondary">Income</Badge>
            {item.possibleDuplicate ? (
              <Badge variant="outline">Possible duplicate</Badge>
            ) : null}
            {item.hasReceipt ? (
              <Badge variant="outline">
                Receipt attached
                {item.receiptKind && item.receiptKind !== "details" ? (
                  <ReceiptLinks
                    href={pendingReceiptFileHref(item.id, item.receiptKind)}
                    kind={item.receiptKind}
                    label={item.label}
                  />
                ) : null}
              </Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm">
            {day(item.receivedOn)}
            {item.payer && item.payer !== item.label ? ` · ${item.payer}` : ""}
            {` · into ${item.accountName ?? "your main chequing"}`}
            {item.client ? ` · from ${item.client}` : ""}
          </p>
          {item.source ? (
            <p className="truncate text-muted-foreground text-xs">
              {item.source}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            +{formatMoney(item.amountCents)}
          </p>
          <PendingIncomeActions item={item} />
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
