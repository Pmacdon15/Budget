import { Plus, Receipt } from "lucide-react";
import { Suspense } from "react";
import { CategoryBars } from "@/components/charts/category-bars";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { ExpenseActions } from "@/components/expense-actions";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
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
import { categoryColor } from "@/lib/categories";
import { type CategoryTotal, getMonthOverview } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Spending" };

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

async function Expenses({ searchParams }: { searchParams: SearchParams }) {
  const month = await monthFrom(searchParams);
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
      <PageHeader
        title="Spending"
        description={`One-off expenses in ${monthLabel(month)} — everything that isn't a fixed bill.`}
      >
        <ExpenseDialog
          month={month}
          trigger={
            <Button>
              <Plus /> Add expense
            </Button>
          }
        />
      </PageHeader>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={`No spending logged for ${monthLabel(month)}`}
          description="Groceries, gas, dinners out — add them as you go and they'll show up in your report."
        >
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
                        </div>
                        <div className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                          {expense.spentOn}
                          <span className="sm:hidden">
                            {" "}
                            · {expense.category}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline">{expense.category}</Badge>
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
