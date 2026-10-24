import { getExpensesForExport } from "@/dal/expenses";
import { buildExpenseExport } from "@/lib/exports/expenses";
import { readReceiptImage } from "@/lib/receipt-store";
import { expenseExportSchema } from "@/lib/schemas";

/**
 * Downloads expenses as CSV, Excel or PDF:
 *
 *     /expenses/export?format=pdf&from=2026-01&to=2026-10&category=Groceries&category=Dining&photos=1
 *
 * `category` repeats once per ticked box. `photos=1` adds each receipt photo
 * to a PDF. Only the signed-in user's expenses are read.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = expenseExportSchema.safeParse({
    format: params.get("format"),
    from: params.get("from"),
    to: params.get("to"),
    categories: params.getAll("category"),
    photos: params.get("photos") === "1",
  });
  if (!parsed.success) {
    return new Response(parsed.error.issues[0]?.message ?? "Invalid download", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const filters = parsed.data;
  const rows = await getExpensesForExport(filters);
  const file = await buildExpenseExport(rows, filters, {
    loadPhoto: readReceiptImage,
  });

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
