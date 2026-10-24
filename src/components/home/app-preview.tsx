import {
  CalendarRange,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { categoryColor } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  SAMPLE_EXPENSES,
  SAMPLE_FIXED,
  SAMPLE_INCOME,
  SAMPLE_MONTH,
  SAMPLE_TOTALS,
  shareOfIncome,
} from "@/lib/sample-month";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Fixed bills", icon: CalendarRange },
  { label: "Take-home", icon: Wallet },
  { label: "Spending", icon: Receipt },
  { label: "Report", icon: FileText },
] as const;

const landed = SAMPLE_INCOME.filter((i) => i.amountCents !== null).length;

/**
 * A static picture of the Overview page, built from the same components the
 * app uses, filled with the sample month. Nothing in it is interactive.
 */
export function AppPreview({ className }: { className?: string }) {
  const spent = SAMPLE_TOTALS.fixedCents + SAMPLE_TOTALS.spentCents;
  const usage = shareOfIncome(spent);

  return (
    <figure
      aria-label={`Preview of the Budget overview for a sample ${SAMPLE_MONTH}`}
      className={cn(
        "overflow-hidden rounded-xl bg-muted/30 shadow-sm ring-1 ring-foreground/10",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-12 items-center gap-3 border-b bg-background px-4"
      >
        <Logo className="size-6" />
        <div className="hidden items-center gap-1 md:flex">
          {NAV.map(({ label, icon: Icon, ...rest }) => (
            <span
              key={label}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-muted-foreground text-sm",
                "active" in rest && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </span>
          ))}
        </div>
        <Badge variant="secondary" className="ml-auto">
          Sample
        </Badge>
      </div>

      <div className="grid gap-4 p-4 md:p-6">
        <div>
          <p className="font-semibold text-xl tracking-tight">{SAMPLE_MONTH}</p>
          <p className="text-muted-foreground text-sm">
            Where your money is going this month.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Take-home"
            icon={Wallet}
            value={formatMoney(SAMPLE_TOTALS.incomeCents)}
            hint={`${landed} of ${SAMPLE_INCOME.length} paycheques in`}
          />
          <StatCard
            label="Fixed bills"
            icon={CalendarRange}
            value={formatMoney(SAMPLE_TOTALS.fixedCents)}
            hint={`${SAMPLE_FIXED.length} recurring bills`}
          />
          <StatCard
            label="Spending"
            icon={Receipt}
            value={formatMoney(SAMPLE_TOTALS.spentCents)}
            hint={`${SAMPLE_EXPENSES.length} expenses`}
          />
          <StatCard
            label="Left over"
            icon={PiggyBank}
            value={formatMoney(SAMPLE_TOTALS.leftCents)}
            tone="positive"
            hint={`${formatPercent(shareOfIncome(SAMPLE_TOTALS.leftCents))} of take-home`}
          />
        </div>

        <Card size="sm">
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
              <span className="font-medium">
                {formatPercent(usage)} of take-home spent
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatMoney(spent)} / {formatMoney(SAMPLE_TOTALS.incomeCents)}
              </span>
            </div>
            <Progress
              value={Math.round(usage * 100)}
              aria-label="Share of take-home spent"
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Fixed bills</CardTitle>
              <CardDescription>Ordered by due day.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {SAMPLE_FIXED.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(item.category) }}
                    />
                    <span className="truncate font-medium">{item.name}</span>
                    <Badge variant="secondary" className="tabular-nums">
                      Day {item.dueDay}
                    </Badge>
                    <span className="ml-auto tabular-nums">
                      {formatMoney(item.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Recent spending</CardTitle>
              <CardDescription>
                The latest one-off expenses this month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {SAMPLE_EXPENSES.map((expense) => (
                  <li
                    key={expense.description}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: categoryColor(expense.category),
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {expense.description}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {expense.category} · {expense.date}
                      </div>
                    </div>
                    <span className="ml-auto tabular-nums">
                      {formatMoney(expense.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </figure>
  );
}
