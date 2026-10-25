"use client";

import { Field } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { Input } from "@/components/ui/input";
import { type Category, categoryColor, categoryLabel } from "@/lib/categories";
import type { CategoryLimit } from "@/lib/category-budgets";
import { centsToInput, formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import {
  carryField,
  includeField,
  type RolloverAmount,
  type RolloverSettings,
  rolloverSchema,
} from "@/lib/rollover";
import { useSaveRollover } from "@/mutations/rollover";

/**
 * Turns rollover on or off, picks the month it starts from and the categories
 * it covers, and sets the real amount carried into `month` per category.
 */
export function RolloverDialog({
  month,
  settings,
  limits,
  amounts,
  trigger,
}: {
  month: string;
  settings: RolloverSettings;
  /** The categories with a budget in `month`. */
  limits: CategoryLimit[];
  amounts: RolloverAmount[];
  trigger: React.ReactElement;
}) {
  const mutation = useSaveRollover();
  const excluded = new Set(settings.excluded);
  const byCategory = new Map(amounts.map((a) => [a.category, a]));

  return (
    <FormDialog
      trigger={trigger}
      title="Roll over unspent money"
      description="Carry what's left of a category's budget into the next month. Fixed bills count as each month's cost, paid or not."
      submitLabel="Save rollover"
      successMessage="Rollover saved"
      schema={rolloverSchema}
      mutation={mutation}
    >
      <input type="hidden" name="month" value={month} />
      <input
        type="hidden"
        name="categories"
        value={limits.map((l) => l.category).join(",")}
      />
      <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
        <input
          type="checkbox"
          name="enabled"
          className="size-4 accent-primary"
          defaultChecked={settings.enabled}
        />
        Roll over unspent budget
      </label>
      <Field
        label="Starts from"
        htmlFor="rollover-start"
        hint="The first month whose unspent money carries forward. Nothing carries into it unless you set an amount below."
      >
        <Input
          id="rollover-start"
          name="startMonth"
          type="month"
          defaultValue={settings.startMonth}
        />
        <FieldError name="startMonth" />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-medium text-sm">
          Carried into {monthLabel(month)}
        </legend>
        <p className="text-muted-foreground text-xs">
          Leave an amount blank to use the calculated one, or type what you
          really have left, for a messy first month or missing receipts.
        </p>
        <div className="-mx-1 grid max-h-[40vh] gap-3 overflow-y-auto px-1">
          {limits.map(({ category }) => (
            <CategoryRow
              key={category}
              category={category as Category}
              month={month}
              included={!excluded.has(category)}
              amount={byCategory.get(category)}
            />
          ))}
        </div>
      </fieldset>
    </FormDialog>
  );
}

function CategoryRow({
  category,
  month,
  included,
  amount,
}: {
  category: Category;
  month: string;
  included: boolean;
  amount: RolloverAmount | undefined;
}) {
  const name = carryField(category);
  const label = categoryLabel(category);
  return (
    <div className="grid grid-cols-[1fr_8rem] items-start gap-3">
      <div className="grid gap-0.5 pt-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={includeField(category)}
            className="size-4 accent-primary"
            defaultChecked={included}
          />
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(category) }}
          />
          {label}
        </label>
        {amount ? (
          <span className="pl-6 text-muted-foreground text-xs tabular-nums">
            Calculated: {formatMoney(amount.calculatedCents)}
          </span>
        ) : null}
      </div>
      <div className="grid gap-1">
        <MoneyInputOptional
          id={name}
          name={name}
          label={`${label} carried into ${monthLabel(month)}`}
          defaultValue={
            amount?.adjusted ? centsToInput(amount.carriedCents) : ""
          }
          placeholder={amount ? centsToInput(amount.calculatedCents) : "0.00"}
        />
        <FieldError name={name} />
      </div>
    </div>
  );
}

/** Like `MoneyInput`, but blank is allowed and means "use the calculated amount". */
function MoneyInputOptional({
  id,
  name,
  label,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted-foreground md:text-sm">
        $
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="pl-7 tabular-nums"
      />
    </div>
  );
}
