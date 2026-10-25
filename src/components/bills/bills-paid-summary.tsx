import type { BillsPaidSummary as Summary } from "@/lib/bill-payments";
import { formatMoney } from "@/lib/money";

/** "2 of 5 paid · $1,234.00 still due" for the month being viewed. */
export function BillsPaidSummary({ summary }: { summary: Summary }) {
  const { paidCount, totalCount, dueCents } = summary;
  if (totalCount === 0) return null;
  return (
    <span className="tabular-nums">
      {paidCount} of {totalCount} paid
      {" · "}
      {dueCents === 0
        ? "nothing left to pay"
        : `${formatMoney(dueCents)} still due`}
    </span>
  );
}
