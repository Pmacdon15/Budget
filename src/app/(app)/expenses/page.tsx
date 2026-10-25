import { Paperclip, Plus, Receipt } from "lucide-react";
import { Suspense } from "react";
import { CategoryBudgetsCard } from "@/components/budgets/category-budgets-card";
import { CategoryBars } from "@/components/charts/category-bars";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { ExpenseActions } from "@/components/expense-actions";
import { ExportDialog } from "@/components/export-dialog";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { PageHeader } from "@/components/page-header";
import { ScanReceiptButton } from "@/components/scan-receipt-button";
import {
  ActionsSkeleton,
  SplitCardsSkeleton,
  TextSkeleton,
} from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMonthOverview } from "@/dal/overview";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";
import type { CategoryTotal } from "@/lib/types";

export const metadata = { title: "Spending" };

/*
 * Not async: the heading is in the static shell. The month name, the buttons
 * that need the month, and the list each wait in their own `<Suspense>` hole.
 */
export default function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Spending"
        description={
          <>
            One-off expenses in{" "}
            <Suspense fallback={<TextSkeleton className="w-24" />}>
              {month.then((m) => monthLabel(m))}
            </Suspense>{" "}
            — everything that isn't a fixed bill.
          </>
        }
      >
        <Suspense fallback={<ActionsSkeleton count={3} />}>
          {month.then((m) => (
            <>
              <ExportDialog month={m} />
              <ScanReceiptButton month={m} />
              <ExpenseDialog
                month={m}
                trigger={
                  <Button>
                    <Plus /> Add expense
                  </Button>
                }
              />
            </>
          ))}
        </Suspense>
      </PageHeader>

      <Suspense fallback={<SplitCardsSkeleton />}>
        <Expenses month={month} />
      </Suspense>

      {/* historyMonths matches the list above, so both share one overview read. */}
      <CategoryBudgetsCard month={month} historyMonths={2} className="mt-4" />
    </>
  );
}

async function Expenses({ month: monthPromise }: { month: Promise<string> }) {
  const month = await monthPromise;
  const { expenses, current, previous } = await getMonthOverview(month, 2);

  const byCategory = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    const entry = byCategory.get(e.category) ?? {
      category: e.category,
      fixedCents: 0,
      variableCents: 0,
      totalCents: 0,
    };
    entry.variableCents += e.amountCents;
    entry.totalCents += e.amountCents;
    byCategory.set(e.category, entry);
  }
  const categories = [...byCategory.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );

  return (
    <>
      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={`No spending logged for ${monthLabel(month)}`}
          description="Groceries, gas, dinners out — scan a receipt or add them as you go and they'll show up in your report."
        >
          <ScanReceiptButton month={month} />
          <ExpenseDialog
            month={month}
            trigger={<Button>Add an expense</Button>}
          />
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>{formatMoney(current.variableCents)} spent</CardTitle>
              <CardDescription>
                {expenses.length}{" "}
                {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
                <Delta
                  current={current.variableCents}
                  previous={previous.variableCents}
                  goodWhen="down"
                />
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Category
                    </TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: categoryColor(expense.category),
                            }}
                          />
                          <span className="font-medium">
                            {expense.description}
                          </span>
                          {expense.receiptId ? (
                            <a
                              href={`/api/receipts/${expense.receiptId}/image`}
                              target="_blank"
                              rel="noopener"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={`View receipt for ${expense.description}`}
                              title="View receipt"
                            >
                              <Paperclip className="size-3.5" />
                            </a>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                          {expense.spentOn}
                          <span className="sm:hidden">
                            {" "}
                            · {categoryLabel(expense.category)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline">
                          {categoryLabel(expense.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(expense.amountCents)}
                      </TableCell>
                      <TableCell>
                        <ExpenseActions expense={expense} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>By category</CardTitle>
              <CardDescription>
                Spending only — fixed bills not included.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryBars categories={categories} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
