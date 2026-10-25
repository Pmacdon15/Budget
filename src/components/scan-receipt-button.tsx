"use client";

import { Camera, ImageUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import {
  type ScannedReceipt,
  useReceiptPicker,
} from "@/components/receipt-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export { scanReceipt } from "@/components/receipt-picker";

/**
 * "Scan receipt" on the Spending page: take or pick a photo, let the AI read
 * it, then confirm the pre-filled expense.
 */
export function ScanReceiptButton({ month }: { month: string }) {
  const [scan, setScan] = useState<ScannedReceipt | null>(null);
  const [open, setOpen] = useState(false);
  const { scanning, limited, inputs, takePhoto, choosePhoto } =
    useReceiptPicker((result) => {
      if (scan) URL.revokeObjectURL(scan.previewUrl);
      setScan(result);
      setOpen(true);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              disabled={scanning || limited != null}
              title={limited ?? undefined}
            >
              {scanning ? <Loader2 className="animate-spin" /> : <Camera />}
              {scanning
                ? "Reading receipt…"
                : limited
                  ? "Scan limit reached"
                  : "Scan receipt"}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={takePhoto}>
            <Camera /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={choosePhoto}>
            <ImageUp /> Choose photo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {inputs}
      {limited ? <output className="sr-only">{limited}</output> : null}
      {scan ? (
        <ExpenseDialog
          key={scan.image}
          month={month}
          scan={scan}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
