import { SearchX } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { ExpenseSearch } from "@/lib/schemas/expense-search";
import type { Expense } from "@/lib/types";

/** The list card's subtitle while a search is narrowing it. */
export function ExpenseSearchSummary({
  matches,
  month,
  search,
  limit,
}: {
  matches: Expense[];
  month: string;
  search: ExpenseSearch;
  limit: number;
}) {
  const total = matches.reduce((sum, e) => sum + e.amountCents, 0);
  const where = search.allMonths
    ? "across all months"
    : `in ${monthLabel(month)}`;
  return (
    <>
      {matches.length >= limit ? `First ${limit}` : matches.length}{" "}
      {matches.length === 1 ? "match" : "matches"} {where} ·{" "}
      <span className="tabular-nums">{formatMoney(total)}</span>
    </>
  );
}

/** Stands in for the table rows when nothing matches. */
export function NoMatchesRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center">
        <SearchX
          aria-hidden="true"
          className="mx-auto mb-2 size-5 text-muted-foreground"
        />
        <p className="font-medium">No expenses match your search.</p>
        <p className="text-muted-foreground text-sm">
          Try fewer words, another category, or all months.
        </p>
      </TableCell>
    </TableRow>
  );
}
