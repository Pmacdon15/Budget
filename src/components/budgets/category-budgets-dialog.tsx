"use client";

import { Field } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/categories";
import {
  type CategoryLimit,
  categoryBudgetsSchema,
  limitField,
} from "@/lib/category-budgets";
import { centsToInput } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import { useSetCategoryBudgets } from "@/mutations/category-budgets";

/** Sets a monthly limit per category, from `month` onward. Blank means no limit. */
export function CategoryBudgetsDialog({
  month,
  limits,
  trigger,
}: {
  month: string;
  limits: CategoryLimit[];
  trigger: React.ReactElement;
}) {
  const mutation = useSetCategoryBudgets();
  const current = new Map(limits.map((l) => [l.category, l.limitCents]));

  return (
    <FormDialog
      trigger={trigger}
      title="Category budgets"
      description={`Monthly limits from ${monthLabel(month)} onward; earlier months keep theirs. Fixed bills count toward their category. Leave a category blank for no limit.`}
      submitLabel="Save budgets"
      successMessage="Budgets saved"
      schema={categoryBudgetsSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={month} />
      <FieldError name="month" />
      <div className="-mx-1 grid max-h-[55vh] gap-3 overflow-y-auto px-1 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const name = limitField(category.name);
          const limit = current.get(category.name);
          return (
            <Field key={category.name} label={category.label} htmlFor={name}>
              <LimitInput
                id={name}
                name={name}
                color={category.color}
                defaultValue={limit == null ? "" : centsToInput(limit)}
              />
              <FieldError name={name} />
            </Field>
          );
        })}
      </div>
    </FormDialog>
  );
}

/** A money input that may be left blank, marked with the category's colour. */
function LimitInput({
  id,
  name,
  color,
  defaultValue,
}: {
  id: string;
  name: string;
  color: string;
  defaultValue: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 my-auto size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="pointer-events-none absolute inset-y-0 left-7 flex items-center text-base text-muted-foreground md:text-sm">
        $
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        placeholder="No limit"
        defaultValue={defaultValue}
        className="pl-11 tabular-nums"
      />
    </div>
  );
}
