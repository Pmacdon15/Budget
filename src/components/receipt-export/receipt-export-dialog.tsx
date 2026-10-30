"use client";

import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sheet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/fields";
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
import {
  PERIOD_PRESETS,
  type PeriodPreset,
  presetRange,
  receiptExportHref,
  SUMMARY_FORMATS,
  type SummaryFormat,
} from "@/lib/receipt-export";
import { NothingToExportError } from "@/lib/receipt-export-zip";
import { useDownloadReceiptExport } from "@/mutations/receipt-export";

const FORMAT_OPTIONS: Record<
  SummaryFormat,
  { label: string; icon: typeof FileText }
> = {
  pdf: { label: "PDF", icon: Sheet },
  xlsx: { label: "Excel", icon: FileSpreadsheet },
  csv: { label: "CSV", icon: FileText },
};

/**
 * "Download receipts" on the Receipts page: pick a period, and get one .zip
 * with a summary of everything spent (CSV, Excel and/or PDF, chosen at the
 * top) and a copy of every receipt, saved email and bill PDF in it.
 */
export function ReceiptExportDialog() {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formats, setFormats] = useState<Set<SummaryFormat>>(
    () => new Set(SUMMARY_FORMATS),
  );
  const download = useDownloadReceiptExport();
  const { progress } = download;

  const choose = (id: PeriodPreset) => {
    const range = presetRange(id);
    setPreset(id);
    setFrom(range.from);
    setTo(range.to);
  };

  const onOpenChange = (next: boolean) => {
    // Today's date is read on open, not while rendering the page's shell.
    if (next && !from && !to) choose("this-month");
    setOpen(next);
  };

  const toggle = (format: SummaryFormat, on: boolean) => {
    const next = new Set(formats);
    if (on) next.add(format);
    else next.delete(format);
    setFormats(next);
  };

  const result = receiptExportHref({
    from,
    to,
    formats: SUMMARY_FORMATS.filter((f) => formats.has(f)),
  });

  const start = () => {
    if (!("href" in result)) return;
    download.mutate(result.href, {
      onSuccess: (zip) => {
        if (zip.skipped > 0) {
          toast.warning(
            `${zip.skipped} of ${zip.receipts + zip.skipped} receipts couldn't be downloaded. They're listed in missing-receipts.txt.`,
          );
        } else {
          toast.success("Receipts downloaded.");
        }
        setOpen(false);
      },
      onError: (error) => {
        if (error instanceof NothingToExportError) toast.info(error.message);
        else toast.error(error.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <FileArchive /> Download receipts
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download receipts</DialogTitle>
          <DialogDescription>
            One .zip with a summary of everything you spent in the period and a
            copy of every receipt, bill PDF and saved email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium text-sm">
              Summary of all spending
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {SUMMARY_FORMATS.map((id) => {
                const { label, icon: Icon } = FORMAT_OPTIONS[id];
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={formats.has(id)}
                      onChange={(e) => toggle(id, e.target.checked)}
                    />
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </label>
                );
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              Each line names its receipt's file in the zip.
            </p>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium text-sm">Period</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERIOD_PRESETS.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={preset === id ? "default" : "outline"}
                  aria-pressed={preset === id}
                  onClick={() => choose(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" htmlFor="receipt-export-from">
                <Input
                  id="receipt-export-from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset(null);
                    setFrom(e.target.value);
                  }}
                />
              </Field>
              <Field label="To" htmlFor="receipt-export-to">
                <Input
                  id="receipt-export-to"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset(null);
                    setTo(e.target.value);
                  }}
                />
              </Field>
            </div>
          </fieldset>

          {"error" in result ? (
            <p role="alert" className="text-destructive text-sm">
              {result.error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!("href" in result) || download.isPending}
            onClick={start}
          >
            {download.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                {progress && progress.total > 0
                  ? `Zipping ${progress.done} of ${progress.total}…`
                  : "Finding receipts…"}
              </>
            ) : (
              <>
                <FileArchive /> Download .zip
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
