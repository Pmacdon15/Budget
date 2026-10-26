import { Plus, Receipt } from "lucide-react";
import { Suspense } from "react";
import { CategoryBudgetsCard } from "@/components/budgets/category-budgets-card";
import { CategoryBars } from "@/components/charts/category-bars";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { ExpenseActions } from "@/components/expense-actions";
import { ExpenseSearchForm } from "@/components/expense-search/expense-search-form";
import {
  ExpenseSearchSummary,
  NoMatchesRow,
} from "@/components/expense-search/search-results";
import { ExportDialog } from "@/components/export-dialog";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { PageHeader } from "@/components/page-header";
import { ReceiptLinks, receiptFileHref } from "@/components/receipt-links";
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
import { SEARCH_RESULT_LIMIT, searchExpenses } from "@/dal/expense-search";
import { getMonthOverview } from "@/dal/overview";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { ReceiptKind } from "@/lib/receipt-files";
import {
  type ExpenseSearch,
  expenseSearchFrom,
  isSearching,
} from "@/lib/schemas/expense-search";
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
  const search = expenseSearchFrom(searchParams);

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

      <Suspense fallback={<ExpenseSearchForm disabled className="mb-4" />}>
        {search.then((s) => (
          <ExpenseSearchForm search={s} className="mb-4" />
        ))}
      </Suspense>

      <Suspense fallback={<SplitCardsSkeleton />}>
        <Expenses month={month} search={search} />
      </Suspense>

      {/* historyMonths matches the list above, so both share one overview read. */}
      <CategoryBudgetsCard month={month} historyMonths={2} className="mt-4" />
    </>
  );
}

async function Expenses({
  month: monthPromise,
  search: searchPromise,
}: {
  month: Promise<string>;
  search: Promise<ExpenseSearch>;
}) {
  const [month, search] = await Promise.all([monthPromise, searchPromise]);
  const searching = isSearching(search);
  const [{ expenses, current, previous }, matches] = await Promise.all([
    getMonthOverview(month, 2),
    searching ? searchExpenses(month, search) : null,
  ]);
  const shown = matches ?? expenses;

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
      {expenses.length === 0 && !searching ? (
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
                {matches ? (
                  <ExpenseSearchSummary
                    matches={matches}
                    month={month}
                    search={search}
                    limit={SEARCH_RESULT_LIMIT}
                  />
                ) : (
                  <>
                    {expenses.length}{" "}
                    {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
                    <Delta
                      current={current.variableCents}
                      previous={previous.variableCents}
                      goodWhen="down"
                    />
                  </>
                )}
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
                  {shown.length === 0 ? <NoMatchesRow colSpan={4} /> : null}
                  {shown.map((expense) => (
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
                          {expense.unpaid ? (
                            <Badge variant="outline">Not paid yet</Badge>
                          ) : null}
                          {expense.receiptId ? (
                            <ReceiptLinks
                              href={receiptFileHref(
                                expense.receiptId,
                                receiptKindOf(expense),
                              )}
                              photoHref={`/api/receipts/${expense.receiptId}/image`}
                              kind={receiptKindOf(expense)}
                              label={expense.description}
                            />
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

/** What an expense's receipt shows, for its links. */
function receiptKindOf(expense: {
  receiptKind?: ReceiptKind | null;
  receiptHasPhoto?: boolean;
}): ReceiptKind {
  return (
    expense.receiptKind ??
    (expense.receiptHasPhoto === false ? "details" : "photo")
  );
}
