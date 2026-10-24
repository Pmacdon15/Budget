import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  SAMPLE_EXPENSES,
  SAMPLE_FIXED,
  SAMPLE_INCOME,
  SAMPLE_MONTH,
  SAMPLE_TOTALS,
} from "@/lib/sample-month";
import { cn } from "@/lib/utils";

function Section({
  title,
  total,
  children,
}: {
  title: string;
  total: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1">
      <h3 className="flex items-baseline justify-between border-b pb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <span>{title}</span>
        <span className="font-mono tabular-nums normal-case tracking-normal">
          {total}
        </span>
      </h3>
      <ul className="divide-y divide-dashed font-mono text-[13px] tabular-nums">
        {children}
      </ul>
    </section>
  );
}

function Row({
  when,
  label,
  amount,
  muted,
}: {
  when: string;
  label: string;
  amount: string;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 py-1.5",
        muted && "text-muted-foreground",
      )}
    >
      <span className="text-muted-foreground">{when}</span>
      <span className="truncate font-sans">{label}</span>
      <span>{amount}</span>
    </li>
  );
}

/** A month of the sample budget, laid out like a page of a ledger. */
export function LedgerCard({ className }: { className?: string }) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="border-b">
        <CardTitle className="font-semibold text-lg tracking-tight">
          {SAMPLE_MONTH}
        </CardTitle>
        <CardDescription>Take-home, fixed bills and spending</CardDescription>
        <CardAction>
          <Badge variant="secondary">Sample</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Section
          title="Take-home, as it lands"
          total={formatMoney(SAMPLE_TOTALS.incomeCents)}
        >
          {SAMPLE_INCOME.map((income) => (
            <Row
              key={income.date}
              when={income.date}
              label={
                income.amountCents === null
                  ? `${income.label} — not in yet`
                  : income.label
              }
              amount={
                income.amountCents === null
                  ? "—"
                  : `+${formatMoney(income.amountCents)}`
              }
              muted={income.amountCents === null}
            />
          ))}
        </Section>
        <Section
          title="Fixed, every month"
          total={formatMoney(SAMPLE_TOTALS.fixedCents)}
        >
          {SAMPLE_FIXED.map((item) => (
            <Row
              key={item.name}
              when={`Day ${item.dueDay}`}
              label={item.name}
              amount={`−${formatMoney(item.amountCents)}`}
            />
          ))}
        </Section>
        <Section title="Spending" total={formatMoney(SAMPLE_TOTALS.spentCents)}>
          {SAMPLE_EXPENSES.map((expense) => (
            <Row
              key={expense.description}
              when={expense.date}
              label={expense.description}
              amount={`−${formatMoney(expense.amountCents)}`}
            />
          ))}
        </Section>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <span className="font-medium">Left this month</span>
        <span className="rounded-md bg-highlight px-2 py-0.5 font-mono font-semibold text-highlight-foreground text-lg tabular-nums">
          {formatMoney(SAMPLE_TOTALS.leftCents)}
        </span>
      </CardFooter>
    </Card>
  );
}
