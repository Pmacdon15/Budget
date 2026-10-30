import { Landmark } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { TextSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccounts } from "@/dal/accounts";
import { getBankBalance } from "@/dal/bank-balance";
import { netChequingCents } from "@/lib/accounts";
import {
  balanceDebitLabel,
  balanceUpdatedLabel,
  isOverdrawn,
} from "@/lib/bank-balance";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BankBalanceActions } from "./bank-balance-actions";

/**
 * What's in the bank right now: the primary chequing account's balance as the
 * user last entered it, less the expenses added since. With more than one
 * account it also shows net chequing (what leftover spend counts) and links
 * to the Accounts page. It isn't tied to
 * the month being viewed, but its holes still wait for the URL (`month`) first
 * and only then read the session and database, so the static shell never needs
 * either. The frame and label are in the shell; both holes share one read
 * through the DAL's per-request `cache()`.
 */
export function BankBalanceCard({
  month,
  className,
}: {
  month: Promise<string>;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("mt-4", className)}>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-muted">
            <Landmark className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Bank balance</p>
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <BalanceValue month={month} />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<TextSkeleton className="w-48" />}>
          <BalanceDetails month={month} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

type Props = { month: Promise<string> };

async function BalanceValue({ month }: Props) {
  await month;
  const balance = await getBankBalance();
  if (!balance) {
    return (
      <p className="font-semibold text-2xl text-muted-foreground tracking-tight">
        —
      </p>
    );
  }
  const overdrawn = isOverdrawn(balance);
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-semibold text-2xl tabular-nums tracking-tight",
        overdrawn && "text-rose-600 dark:text-rose-400",
      )}
    >
      {formatMoney(balance.balanceCents)}
      {overdrawn ? <Badge variant="destructive">Overdrawn</Badge> : null}
    </p>
  );
}

async function BalanceDetails({ month }: Props) {
  await month;
  const [balance, accounts] = await Promise.all([
    getBankBalance(),
    getAccounts(),
  ]);
  const debit = balance ? balanceDebitLabel(balance) : null;
  const several = accounts.length > 1;
  const chequingCount = accounts.filter((a) => a.type === "chequing").length;
  const net = netChequingCents(accounts);
  return (
    <div className="flex min-w-0 flex-[1_1_16rem] flex-wrap items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        <p>
          {balance
            ? `${several ? `${balance.accountName} · ` : ""}${balanceUpdatedLabel(balance.updatedAt)}`
            : "Add what's in your account now. Negative is fine if you're overdrawn."}
        </p>
        {debit ? <p>{debit}</p> : null}
        {chequingCount > 1 && net !== null ? (
          <p>
            Net chequing across {chequingCount} accounts:{" "}
            <span
              className={cn(
                "tabular-nums",
                net < 0 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatMoney(net)}
            </span>
          </p>
        ) : null}
      </div>
      {several ? (
        <Link href="/accounts" className="text-sm underline underline-offset-4">
          Manage accounts
        </Link>
      ) : (
        <BankBalanceActions balance={balance} />
      )}
    </div>
  );
}
