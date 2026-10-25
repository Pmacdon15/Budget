import { formatMoney } from "@/lib/money";

/**
 * The change from the same months of last year. `goodWhen` says whether going
 * up is good (take-home, left over) or bad (bills, spending).
 */
export function YearChange({
  current,
  previous,
  goodWhen,
}: {
  current: number;
  previous: number;
  goodWhen: "up" | "down";
}) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground">—</span>;
  const good = goodWhen === "up" ? diff > 0 : diff < 0;
  return (
    <span
      className={
        good
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }
    >
      {diff > 0 ? "+" : "−"}
      {formatMoney(Math.abs(diff))}
    </span>
  );
}
