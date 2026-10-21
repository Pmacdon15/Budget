import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Shows the change vs. last month. `goodWhen` says whether going up is good (income) or bad (spending). */
export function Delta({
  current,
  previous,
  goodWhen,
}: {
  current: number;
  previous: number;
  goodWhen: "up" | "down";
}) {
  const diff = current - previous;
  if (previous === 0 && current === 0) return <span>No data last month</span>;
  if (diff === 0) return <span>Same as last month</span>;
  const up = diff > 0;
  const good = goodWhen === "up" ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center font-medium tabular-nums",
          good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        )}
      >
        <Icon className="size-3.5" />
        {formatMoney(Math.abs(diff))}
      </span>
      vs last month
    </span>
  );
}
