import { ArrowRightLeft, FileDown, Landmark, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAccounts, getStatements, getTransfers } from "@/dal/accounts";
import {
  type Account,
  type AccountStatement,
  accountSubtitle,
  balanceAsOfLabel,
  balanceNote,
  dateLabel,
  formatBalance,
  isDebtType,
  netChequingCents,
  totalOwedCents,
} from "@/lib/accounts";
import { balanceDebitLabel } from "@/lib/bank-balance";
import { formatMoney } from "@/lib/money";
import { today } from "@/lib/month";
import { cn } from "@/lib/utils";
import { AccountActions, DeleteTransferButton } from "./account-actions";
import { AccountDialog } from "./account-dialog";
import { TransferDialog } from "./transfer-dialog";

/*
 * The Accounts page's holes. Each waits for the URL first and only then reads
 * the session and database, so the static shell never needs either. They
 * share one read per request through the DAL's `cache()`.
 */

type Props = { month: Promise<string> };

/** "Add account", plus "Record transfer" once there are two accounts. */
export async function AccountsHeaderActions({ month }: Props) {
  await month;
  const accounts = await getAccounts();
  return (
    <>
      {accounts.length >= 2 ? (
        <TransferDialog
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          today={today()}
          trigger={
            <Button variant="outline">
              <ArrowRightLeft /> Record transfer
            </Button>
          }
        />
      ) : null}
      <AccountDialog
        trigger={
          <Button>
            <Plus /> Add account
          </Button>
        }
      />
    </>
  );
}

/** Net chequing (what leftover spend counts) and what's owed on credit. */
export async function AccountsSummary({ month }: Props) {
  await month;
  const accounts = await getAccounts();
  if (accounts.length === 0) return null;
  const net = netChequingCents(accounts);
  const owed = totalOwedCents(accounts);
  const hasDebt = accounts.some((a) => isDebtType(a.type));
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2">
      <Card size="sm">
        <CardContent className="grid gap-1">
          <p className="text-muted-foreground text-sm">Net chequing</p>
          <p
            className={cn(
              "font-semibold text-2xl tabular-nums tracking-tight",
              net !== null && net < 0 && "text-rose-600 dark:text-rose-400",
            )}
          >
            {net === null ? "—" : formatMoney(net)}
          </p>
          <p className="text-muted-foreground text-xs">
            {net !== null && net < 0
              ? "Below zero, so nothing is left to spend this month."
              : "All chequing accounts combined. This is what leftover spend counts."}
          </p>
        </CardContent>
      </Card>
      {hasDebt ? (
        <Card size="sm">
          <CardContent className="grid gap-1">
            <p className="text-muted-foreground text-sm">Owed on credit</p>
            <p className="font-semibold text-2xl tabular-nums tracking-tight">
              {formatMoney(owed)}
            </p>
            <p className="text-muted-foreground text-xs">
              Credit cards and lines of credit. Not counted against leftover
              spend.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** One card per account, primary chequing first. */
export async function AccountCards({ month }: Props) {
  await month;
  const [accounts, statements] = await Promise.all([
    getAccounts(),
    getStatements(),
  ]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="No accounts yet"
        description="Add your chequing account, credit cards and lines of credit. Your AI assistant can keep their balances current from statement emails."
      >
        <AccountDialog
          trigger={
            <Button size="sm">
              <Plus /> Add account
            </Button>
          }
        />
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          statements={statements.filter((s) => s.accountId === account.id)}
        />
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function AccountCard({
  account,
  statements,
}: {
  account: Account;
  statements: AccountStatement[];
}) {
  const note = balanceNote(account);
  const debit = balanceDebitLabel(account);
  const negative = !isDebtType(account.type) && account.balanceCents < 0;
  const details = [
    account.creditLimitCents != null
      ? { label: "Credit limit", value: formatMoney(account.creditLimitCents) }
      : null,
    account.availableCreditCents != null
      ? {
          label: "Available credit",
          value: formatMoney(account.availableCreditCents),
        }
      : null,
    account.statementBalanceCents != null
      ? {
          label: account.statementClosingDate
            ? `Statement (${dateLabel(account.statementClosingDate)})`
            : "Statement balance",
          value: formatMoney(account.statementBalanceCents),
        }
      : null,
    account.minimumPaymentCents != null
      ? {
          label: "Minimum payment",
          value: formatMoney(account.minimumPaymentCents),
        }
      : null,
    account.paymentDueDate
      ? { label: "Payment due", value: dateLabel(account.paymentDueDate) }
      : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="truncate">{account.name}</span>
          {account.isPrimary ? (
            <Badge variant="secondary">Main chequing</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{accountSubtitle(account)}</CardDescription>
        <CardAction>
          <AccountActions account={account} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <p
            className={cn(
              "flex items-center gap-2 font-semibold text-2xl tabular-nums tracking-tight",
              negative && "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatBalance(account)}
            {note ? (
              <Badge variant={negative ? "destructive" : "outline"}>
                {note}
              </Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground text-xs">
            {balanceAsOfLabel(account)}
            {debit ? ` · ${debit}` : null}
          </p>
        </div>
        {details.length > 0 ? (
          <dl className="grid gap-1">
            {details.map((d) => (
              <Detail key={d.label} label={d.label} value={d.value} />
            ))}
          </dl>
        ) : null}
        {statements.length > 0 ? (
          <div className="grid gap-1">
            <p className="font-medium text-sm">Statements</p>
            <ul className="grid gap-1 text-sm">
              {statements.slice(0, 6).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-muted-foreground">
                    {dateLabel(s.closingDate)} ·{" "}
                    <span className="tabular-nums">
                      {formatMoney(s.balanceCents)}
                    </span>
                  </span>
                  {s.hasPdf ? (
                    <a
                      href={`/api/statements/${s.id}/pdf`}
                      className="flex items-center gap-1 underline underline-offset-4"
                      download
                    >
                      <FileDown className="size-3.5" /> PDF
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Recent transfers between accounts. They're never spending. */
export async function TransferList({ month }: Props) {
  await month;
  const transfers = await getTransfers();
  if (transfers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No transfers yet. A credit card payment from chequing is a transfer, not
        an expense.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {transfers.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {t.fromName ?? "Deleted account"} →{" "}
              {t.toName ?? "Deleted account"}
            </div>
            <div className="text-muted-foreground text-xs">
              {t.transferredOn}
              {t.description ? ` · ${t.description}` : null}
            </div>
          </div>
          <span className="ml-auto tabular-nums">
            {formatMoney(t.amountCents)}
          </span>
          <DeleteTransferButton
            id={t.id}
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** The frame for the transfers list; the list itself is a hole. */
export function TransfersCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Transfers</CardTitle>
        <CardDescription>
          Money moved between your accounts, like credit card payments. Never
          counted as spending.
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
