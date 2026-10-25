import { Search, X } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RECEIPT_SEARCH_MAX_LENGTH } from "@/lib/schemas/receipt-library";

/**
 * Searches the receipt library by merchant or description. A plain GET form,
 * so the search lives in the URL (`?q=`) and works without JavaScript.
 *
 * Without `query` it renders the empty form, which is the static shell's
 * fallback while the URL is unknown.
 */
export function ReceiptSearchForm({ query = "" }: { query?: string }) {
  return (
    <form
      action="/receipts"
      method="get"
      aria-label="Search receipts"
      className="flex flex-wrap items-center gap-2"
    >
      <label htmlFor="receipt-search" className="sr-only">
        Search receipts
      </label>
      <Input
        id="receipt-search"
        name="q"
        type="search"
        defaultValue={query}
        maxLength={RECEIPT_SEARCH_MAX_LENGTH}
        placeholder="Merchant or description"
        className="w-full sm:w-72"
      />
      <Button type="submit" variant="secondary">
        <Search /> Search
      </Button>
      {query ? (
        <Link href="/receipts" className={buttonVariants({ variant: "ghost" })}>
          <X /> Clear
        </Link>
      ) : null}
    </form>
  );
}
