"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORY_NAMES, type Category } from "@/lib/categories";
import { formatMoney, parseMoney } from "@/lib/money";
import { CategorySelect, MoneyInput } from "./fields";
import { FieldError } from "./form-dialog";

export type SplitDraft = { category: Category; amount: string };

let nextKey = 0;
const withKey = (line: SplitDraft) => ({ ...line, key: nextKey++ });

/**
 * Splits one receipt across categories. The lines travel with the form as a
 * single JSON hidden input (`splits`) plus the headline `category`, which is
 * the largest part; the schema checks the parts add up to the total.
 */
export function SplitEditor({
  total,
  initial,
}: {
  /** The expense's total as typed, to show what is left to assign. */
  total: string;
  initial: SplitDraft[];
}) {
  const [lines, setLines] = useState(() => initial.map(withKey));

  const update = (key: number, change: Partial<SplitDraft>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const remove = (key: number) => setLines(lines.filter((l) => l.key !== key));
  const add = () => {
    const used = new Set(lines.map((l) => l.category));
    const category = CATEGORY_NAMES.find((c) => !used.has(c)) ?? "Other";
    setLines([...lines, withKey({ category, amount: "" })]);
  };

  const totalCents = parseMoney(total);
  const assigned = lines.reduce(
    (sum, l) => sum + (parseMoney(l.amount) ?? 0),
    0,
  );
  const left = totalCents === null ? null : totalCents - assigned;
  const largest = [...lines].sort(
    (a, b) => (parseMoney(b.amount) ?? 0) - (parseMoney(a.amount) ?? 0),
  )[0];

  return (
    <div className="grid gap-2">
      {lines.map((line, i) => (
        <div key={line.key} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CategorySelect
              id={`split-category-${line.key}`}
              name={null}
              aria-label={`Part ${i + 1} category`}
              value={line.category}
              onValueChange={(category) => update(line.key, { category })}
            />
          </div>
          <div className="w-28">
            <MoneyInput
              id={`split-amount-${line.key}`}
              aria-label={`Part ${i + 1} amount`}
              value={line.amount}
              onValueChange={(amount) => update(line.key, { amount })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove part ${i + 1}`}
            disabled={lines.length <= 2}
            onClick={() => remove(line.key)}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus /> Add a category
        </Button>
        {left !== null ? (
          <span
            className={
              left === 0
                ? "text-muted-foreground text-xs"
                : "text-destructive text-xs"
            }
          >
            {left === 0
              ? "Fully split"
              : left > 0
                ? `${formatMoney(left)} left to split`
                : `${formatMoney(-left)} over the total`}
          </span>
        ) : null}
      </div>
      <FieldError name="splits" />
      <input
        type="hidden"
        name="splits"
        value={JSON.stringify(
          lines.map(({ category, amount }) => ({ category, amount })),
        )}
      />
      <input
        type="hidden"
        name="category"
        value={largest?.category ?? "Other"}
      />
    </div>
  );
}
