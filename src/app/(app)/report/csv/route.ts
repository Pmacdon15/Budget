import { getMonthOverview } from "@/dal/overview";
import { categoryLabel } from "@/lib/categories";
import { resolveMonth } from "@/lib/month";

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

export async function GET(request: Request) {
  const month = resolveMonth(new URL(request.url).searchParams.get("month"));
  const { current, income, fixedItems, expenses } = await getMonthOverview(
    month,
    1,
  );

  const rows: (string | number)[][] = [
    ["type", "date", "name", "category", "amount"],
    ...income.map((i) => [
      "take-home",
      i.receivedOn ?? month,
      i.label,
      "",
      dollars(i.amountCents),
    ]),
    ...fixedItems.map((f) => [
      "fixed",
      f.dueDay ? `${month}-${String(f.dueDay).padStart(2, "0")}` : month,
      f.name,
      categoryLabel(f.category),
      dollars(-f.amountCents),
    ]),
    ...expenses.map((e) => [
      "spending",
      e.spentOn,
      e.description,
      categoryLabel(e.category),
      dollars(-e.amountCents),
    ]),
    [],
    ["summary", month, "Take-home", "", dollars(current.incomeCents)],
    ["summary", month, "Fixed bills", "", dollars(-current.fixedCents)],
    ["summary", month, "Spending", "", dollars(-current.variableCents)],
    ["summary", month, "Left over", "", dollars(current.netCents)],
  ];

  const body = rows.map((row) => row.map(cell).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
