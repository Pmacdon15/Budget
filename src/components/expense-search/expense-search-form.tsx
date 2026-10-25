"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { centsToInput } from "@/lib/money";
import {
  EMPTY_SEARCH,
  type ExpenseSearch,
  type ExpenseSearchValues,
  expenseSearchQuery,
  isSearching,
  SEARCH_TEXT_MAX,
} from "@/lib/schemas/expense-search";
import { cn } from "@/lib/utils";

const ALL = "all";

const SCOPES = [
  { value: "month", label: "This month" },
  { value: "all", label: "All months" },
] as const;

/**
 * Search and filters for the Spending page. The search lives in the URL, so
 * submitting replaces the query string (keeping the month) and the page's
 * server holes re-read it. Rendered without `search` and with `disabled`, it
 * is the static shell's placeholder until the URL is known.
 */
export function ExpenseSearchForm({
  search = EMPTY_SEARCH,
  disabled = false,
  className,
}: {
  search?: ExpenseSearch;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const go = (overrides: ExpenseSearchValues = {}, clear = false) => {
    const form = formRef.current;
    const data = form && !clear ? new FormData(form) : null;
    const read = (key: keyof ExpenseSearchValues) => {
      const value = data?.get(key);
      return typeof value === "string" ? value : undefined;
    };
    const values: ExpenseSearchValues = clear
      ? {}
      : {
          q: read("q"),
          category: read("category"),
          min: read("min"),
          max: read("max"),
          scope: read("scope"),
          ...overrides,
        };
    const qs = expenseSearchQuery(window.location.search, values);
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go();
  };

  const active = isSearching(search);
  const off = disabled || pending;

  return (
    <form
      ref={formRef}
      aria-label="Search spending"
      aria-busy={pending || undefined}
      onSubmit={onSubmit}
      // Remount when the URL changes (e.g. Clear) so the fields show it.
      key={JSON.stringify(search)}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <div className="relative min-w-48 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          aria-label="Search description or merchant"
          placeholder="Search description or merchant"
          defaultValue={search.q}
          maxLength={SEARCH_TEXT_MAX}
          disabled={disabled}
          className="pl-8"
        />
      </div>

      <Select
        name="category"
        defaultValue={search.category ?? ALL}
        disabled={disabled}
        onValueChange={(value) => go({ category: String(value ?? ALL) })}
      >
        <SelectTrigger aria-label="Category" className="w-44">
          <SelectValue>
            {(value: string | null) =>
              !value || value === ALL ? "All categories" : categoryLabel(value)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {CATEGORIES.map((category) => (
            <SelectItem key={category.name} value={category.name}>
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <AmountInput
          name="min"
          label="Minimum amount"
          placeholder="Min"
          cents={search.minCents}
          disabled={disabled}
        />
        <span aria-hidden="true" className="text-muted-foreground text-sm">
          –
        </span>
        <AmountInput
          name="max"
          label="Maximum amount"
          placeholder="Max"
          cents={search.maxCents}
          disabled={disabled}
        />
      </div>

      <Select
        name="scope"
        defaultValue={search.allMonths ? "all" : "month"}
        disabled={disabled}
        onValueChange={(value) => go({ scope: String(value ?? "month") })}
      >
        <SelectTrigger aria-label="Months to search" className="w-32">
          <SelectValue>
            {(value: string | null) =>
              SCOPES.find((s) => s.value === value)?.label ?? "This month"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SCOPES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="secondary" disabled={off}>
        <Search /> Search
      </Button>
      {active ? (
        <Button
          type="button"
          variant="ghost"
          disabled={off}
          onClick={() => go({}, true)}
        >
          <X /> Clear
        </Button>
      ) : null}
    </form>
  );
}

function AmountInput({
  name,
  label,
  placeholder,
  cents,
  disabled,
}: {
  name: string;
  label: string;
  placeholder: string;
  cents: number | null;
  disabled: boolean;
}) {
  return (
    <div className="relative w-24">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground text-sm">
        $
      </span>
      <Input
        name={name}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={cents === null ? "" : centsToInput(cents)}
        disabled={disabled}
        className="pl-6 tabular-nums"
      />
    </div>
  );
}
