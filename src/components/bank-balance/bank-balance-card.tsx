import { Landmark } from "lucide-react";
import { Suspense } from "react";
import { TextSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBankBalance } from "@/dal/bank-balance";
import {
  balanceDebitLabel,
  balanceUpdatedLabel,
  isOverdrawn,
} from "@/lib/bank-balance";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BankBalanceActions } from "./bank-balance-actions";

/**
 * What's in the bank right now: the balance the user last entered, less the
 * expenses added since. It isn't tied to
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
  const balance = await getBankBalance();
  const debit = balance ? balanceDebitLabel(balance) : null;
  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
        <p>
          {balance
            ? balanceUpdatedLabel(balance.updatedAt)
            : "Add what's in your account now. Negative is fine if you're overdrawn."}
        </p>
        {debit ? <p>{debit}</p> : null}
      </div>
      <BankBalanceActions balance={balance} />
    </div>
  );
}
