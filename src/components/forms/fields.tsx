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
import { CATEGORIES } from "@/lib/categories";

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
    <div className="grid gap-1.5">
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
  autoFocus,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">
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
        autoFocus={autoFocus}
        className="pl-7 tabular-nums"
      />
    </div>
  );
}

export function CategorySelect({
  id,
  name = "category",
  defaultValue = "Other",
}: {
  id: string;
  name?: string;
  defaultValue?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((category) => (
          <SelectItem key={category.name} value={category.name}>
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
