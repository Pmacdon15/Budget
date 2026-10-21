import { CalendarRange, Plus } from "lucide-react";
import { Suspense } from "react";
import { CategoryBars } from "@/components/charts/category-bars";
import { EmptyState } from "@/components/empty-state";
import { FixedItemActions } from "@/components/fixed-item-actions";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryColor } from "@/lib/categories";
import { type CategoryTotal, getFixedItems, isActive, requireUserId } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Fixed bills" };

export default function FixedPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FixedBills searchParams={searchParams} />
    </Suspense>
  );
}

async function FixedBills({ searchParams }: { searchParams: SearchParams }) {
  const month = await monthFrom(searchParams);
  const userId = await requireUserId();
  const all = await getFixedItems(userId);
  const active = all
    .filter((item) => isActive(item, month))
    .sort((a, b) => b.amountCents - a.amountCents);
  const total = active.reduce((sum, item) => sum + item.amountCents, 0);

  const byCategory = new Map<string, CategoryTotal>();
  for (const item of active) {
    const entry = byCategory.get(item.category) ?? {
      category: item.category,
      fixedCents: 0,
      variableCents: 0,
      totalCents: 0,
    };
    entry.fixedCents += item.amountCents;
    entry.totalCents += item.amountCents;
    byCategory.set(item.category, entry);
  }
  const categories = [...byCategory.values()].sort((a, b) => b.totalCents - a.totalCents);

  return (
    <>
      <PageHeader
        title="Fixed bills"
        description={`Bills that repeat every month. Showing what's active in ${monthLabel(month)}.`}
      >
        <FixedItemDialog
          month={month}
          trigger={
            <Button>
              <Plus /> Add bill
            </Button>
          }
        />
      </PageHeader>

      {active.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No fixed bills this month"
          description="Rent, phone, insurance, streaming — add anything you pay every month. It'll carry forward automatically."
        >
          <FixedItemDialog month={month} trigger={<Button>Add your first bill</Button>} />
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>{formatMoney(total)} / month</CardTitle>
              <CardDescription>
                {active.length} active {active.length === 1 ? "bill" : "bills"}. Editing an amount
                applies from this month forward.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden sm:table-cell">Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: categoryColor(item.category) }}
                          />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground text-xs">
                          Since {monthLabel(item.startMonth, "short")}
                          {item.endMonth ? ` · until ${monthLabel(item.endMonth, "short")}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                        {item.dueDay ? `Day ${item.dueDay}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(item.amountCents)}
                      </TableCell>
                      <TableCell>
                        <FixedItemActions item={item} month={month} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(total)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>By category</CardTitle>
              <CardDescription>Where your fixed costs go.</CardDescription>
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
