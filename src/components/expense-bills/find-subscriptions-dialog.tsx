"use client";

import { Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { amountChanges } from "@/components/expense-bills/make-fixed-bill-dialog";
import { CategorySelect } from "@/components/forms/fields";
import { ListSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { ConvertSubscriptionsResult } from "@/lib/schemas/expense-bills";
import {
  CANDIDATE_MONTHS,
  type CandidateReason,
  type SubscriptionCandidate,
} from "@/lib/subscription-candidates";
import { useConvertSubscriptions } from "@/mutations/expense-bills";
import { useSubscriptionCandidates } from "@/queries/subscription-candidates";

/** What the user chose for one candidate. Nothing is picked until they tick it. */
type Choice = {
  selected: boolean;
  name: string;
  category: Category;
  /** Pay the bill it matched instead of adding a new one. */
  useExisting: boolean;
  updateAmount: boolean;
};

const REASON_LABEL: Record<CandidateReason, string> = {
  keyword: "Sounds like a subscription",
  category: "Filed as a subscription",
  recurring: "Charged every month",
};

function initialPick(c: SubscriptionCandidate): Choice {
  return {
    selected: false,
    name: c.name,
    category: c.category,
    useExisting: Boolean(c.match && c.match.kind !== "amount_far"),
    updateAmount: true,
  };
}

/** "Made 2 fixed bills from 5 charges." plus anything left alone. */
export function convertedMessage(result: ConvertSubscriptionsResult) {
  const bills =
    result.created > 0
      ? `Made ${result.created} fixed ${result.created === 1 ? "bill" : "bills"}`
      : "Updated your bills";
  const charges = `${result.payments} ${result.payments === 1 ? "charge" : "charges"}`;
  const skipped =
    result.skipped > 0
      ? ` ${result.skipped} left as ${result.skipped === 1 ? "an expense" : "expenses"}: the bill was already paid or didn't run that month.`
      : "";
  return `${bills} from ${charges}.${skipped}`;
}

/**
 * "Find subscriptions" on the Spending page: lists saved expenses from the
 * last few months that look like subscriptions or memberships (never usage
 * charges like API credits or top-ups). The user ticks the ones to convert,
 * can rename them, and confirms; each becomes a monthly fixed bill (or pays
 * one they already have) with every charge as its month's payment.
 */
export function FindSubscriptionsDialog({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const query = useSubscriptionCandidates(month, open);
  const convert = useConvertSubscriptions();
  const [picks, setPicks] = useState<Record<string, Choice>>({});

  const candidates = query.data ?? [];
  const pickFor = (c: SubscriptionCandidate) => picks[c.key] ?? initialPick(c);
  const update = (c: SubscriptionCandidate, change: Partial<Choice>) =>
    setPicks((all) => ({ ...all, [c.key]: { ...pickFor(c), ...change } }));
  const chosen = candidates.filter((c) => pickFor(c).selected);
  const allChosen =
    candidates.length > 0 && chosen.length === candidates.length;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPicks({});
      convert.reset();
    }
  };

  const submit = () => {
    const items = chosen.map((c) => {
      const pick = pickFor(c);
      const existing =
        pick.useExisting && c.match ? c.match.bill.id : undefined;
      return {
        expenseIds: c.expenses.map((e) => e.id),
        name: pick.name,
        category: pick.category,
        ...(existing
          ? { fixedItemId: existing, updateAmount: pick.updateAmount }
          : {}),
      };
    });
    convert.mutate(
      { items },
      {
        onSuccess: (result) => {
          toast.success(convertedMessage(result));
          close(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Repeat /> Find subscriptions
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subscriptions in your spending</DialogTitle>
          <DialogDescription>
            Charges from the last {CANDIDATE_MONTHS} months up to{" "}
            {monthLabel(month)} that look like subscriptions or memberships.
            Tick the ones to make fixed bills: each charge becomes its month's
            payment, so nothing is counted twice. Usage charges like API credits
            or top-ups aren't listed.
          </DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <ListSkeleton rows={3} />
        ) : query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {query.error.message}
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing here looks like a subscription. You can still make any
            expense a fixed bill from its ⋯ menu.
          </p>
        ) : (
          <div className="grid gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allChosen}
                onChange={(event) =>
                  setPicks(
                    Object.fromEntries(
                      candidates.map((c) => [
                        c.key,
                        { ...pickFor(c), selected: event.target.checked },
                      ]),
                    ),
                  )
                }
              />
              Select all ({candidates.length})
            </label>
            <ul className="grid gap-3">
              {candidates.map((c) => (
                <CandidateRow
                  key={c.key}
                  candidate={c}
                  pick={pickFor(c)}
                  onChange={(change) => update(c, change)}
                />
              ))}
            </ul>
          </div>
        )}

        {convert.error ? (
          <p role="alert" className="text-destructive text-sm">
            {convert.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={chosen.length === 0 || convert.isPending}
            onClick={submit}
          >
            {convert.isPending
              ? "Converting…"
              : chosen.length === 0
                ? "Make fixed bills"
                : `Make ${chosen.length} fixed ${chosen.length === 1 ? "bill" : "bills"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({
  candidate: c,
  pick,
  onChange,
}: {
  candidate: SubscriptionCandidate;
  pick: Choice;
  onChange: (change: Partial<Choice>) => void;
}) {
  const id = `subscription-${c.key}`;
  const months = c.expenses.map((e) => monthLabel(e.month)).join(", ");
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={pick.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          aria-label={`Make ${c.name} a fixed bill`}
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={id} className="cursor-pointer font-medium">
              {c.name}
            </label>
            <span className="font-medium tabular-nums">
              {formatMoney(c.amountCents)}/mo
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {c.expenses.length} {c.expenses.length === 1 ? "charge" : "charges"}{" "}
            · {months}
          </p>
          <div className="flex flex-wrap gap-1">
            {c.reasons.map((r) => (
              <Badge key={r} variant="outline">
                {REASON_LABEL[r]}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {pick.selected ? (
        <div className="grid gap-2 pl-6">
          {c.match ? (
            <div className="grid gap-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  className="size-4 accent-primary"
                  checked={pick.useExisting}
                  onChange={() => onChange({ useExisting: true })}
                />
                Pay your bill “{c.match.bill.name}” (
                {formatMoney(c.match.bill.amountCents)})
              </label>
              {pick.useExisting && amountChanges(c.match, c.amountCents) ? (
                <label className="flex cursor-pointer items-center gap-2 pl-6">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={pick.updateAmount}
                    onChange={(event) =>
                      onChange({ updateAmount: event.target.checked })
                    }
                  />
                  Update it to {formatMoney(c.amountCents)}
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  className="size-4 accent-primary"
                  checked={!pick.useExisting}
                  onChange={() => onChange({ useExisting: false })}
                />
                Add a new fixed bill
              </label>
            </div>
          ) : null}
          {!pick.useExisting || !c.match ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label={`Name for ${c.name}`}
                value={pick.name}
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
              />
              <CategorySelect
                id={`${id}-category`}
                name={null}
                aria-label={`Category for ${c.name}`}
                value={pick.category}
                onValueChange={(category) => onChange({ category })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
