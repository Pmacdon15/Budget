"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  type Category,
  categoryLabel,
  isCategory,
} from "@/lib/categories";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function MoneyInput({
  id,
  name,
  defaultValue,
  value,
  autoFocus,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  id: string;
  /** Leave out for an input that should not be posted with the form. */
  name?: string;
  defaultValue?: string;
  value?: string;
  autoFocus?: boolean;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
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
        placeholder="0.00"
        required
        defaultValue={defaultValue}
        value={value}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={
          onValueChange ? (e) => onValueChange(e.target.value) : undefined
        }
        className="pl-7 tabular-nums"
      />
    </div>
  );
}

export function CategorySelect({
  id,
  name = "category",
  defaultValue = "Other",
  value,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  id: string;
  /** Pass `null` for a select that should not be posted with the form. */
  name?: string | null;
  defaultValue?: string;
  /** Controls the select, together with `onValueChange`. */
  value?: Category;
  onValueChange?: (value: Category) => void;
  "aria-label"?: string;
}) {
  return (
    <Select
      name={name ?? undefined}
      {...(value === undefined ? { defaultValue } : { value })}
      onValueChange={
        onValueChange
          ? (next) => {
              if (isCategory(next)) onValueChange(next);
            }
          : undefined
      }
    >
      <SelectTrigger id={id} className="w-full" aria-label={ariaLabel}>
        <SelectValue>
          {(value: string | null) => (value ? categoryLabel(value) : null)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
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
  );
}
