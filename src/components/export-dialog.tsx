"use client";

import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/forms/fields";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { CATEGORIES, CATEGORY_NAMES, type Category } from "@/lib/categories";
import { expenseExportSchema } from "@/lib/schemas";

const FORMATS = [
  { id: "csv", label: "CSV", icon: FileText },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { id: "pdf", label: "PDF", icon: Sheet },
] as const;

type Format = (typeof FORMATS)[number]["id"];

/** The download URL for these choices, or the reason they can't be downloaded. */
export function exportHref(choices: {
  format: Format;
  from: string;
  to: string;
  categories: Category[];
  photos: boolean;
}): { href: string } | { error: string } {
  const parsed = expenseExportSchema.safeParse(choices);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your choices" };
  }
  const params = new URLSearchParams({
    format: parsed.data.format,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  for (const category of parsed.data.categories) {
    params.append("category", category);
  }
  if (parsed.data.format === "pdf" && parsed.data.photos)
    params.set("photos", "1");
  return { href: `/expenses/export?${params}` };
}

/** "Download": pick a month range, categories and a file type. */
export function ExportDialog({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("csv");
  const [from, setFrom] = useState(month);
  const [to, setTo] = useState(month);
  const [picked, setPicked] = useState<Set<Category>>(
    () => new Set(CATEGORY_NAMES),
  );
  const [photos, setPhotos] = useState(false);

  const categories = CATEGORY_NAMES.filter((name) => picked.has(name));
  const result = exportHref({ format, from, to, categories, photos });

  const toggle = (name: Category, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(name);
    else next.delete(name);
    setPicked(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Download /> Download
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download expenses</DialogTitle>
          <DialogDescription>
            Choose the months and categories to include.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="export-from">
              <Input
                id="export-from"
                type="month"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="export-to">
              <Input
                id="export-to"
                type="month"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <div className="flex items-center justify-between">
              <legend className="font-medium text-sm">Categories</legend>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(new Set(CATEGORY_NAMES))}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(new Set())}
                >
                  None
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              {CATEGORIES.map((category) => (
                <label
                  key={category.name}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={picked.has(category.name)}
                    onChange={(e) => toggle(category.name, e.target.checked)}
                  />
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium text-sm">File type</legend>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant={format === id ? "default" : "outline"}
                  aria-pressed={format === id}
                  onClick={() => setFormat(id)}
                >
                  <Icon /> {label}
                </Button>
              ))}
            </div>
            {format === "pdf" ? (
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={photos}
                  onChange={(e) => setPhotos(e.target.checked)}
                />
                Include receipt photos
              </label>
            ) : null}
          </fieldset>

          {"error" in result ? (
            <p role="alert" className="text-destructive text-sm">
              {result.error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {"href" in result ? (
            <a
              href={result.href}
              download
              className={buttonVariants()}
              onClick={() => setOpen(false)}
            >
              <Download /> Download
            </a>
          ) : (
            <Button disabled>
              <Download /> Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
