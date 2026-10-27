import { Download, File, FileText, Mail, Paperclip } from "lucide-react";
import { type ReceiptKind, receiptKindLabel } from "@/lib/receipt-files";
import { cn } from "@/lib/utils";

const ICONS = {
  photo: Paperclip,
  pdf: FileText,
  email: Mail,
  file: File,
} as const;

const VIEW_TITLES = {
  photo: "View receipt photo",
  pdf: "View receipt PDF",
  email: "View receipt email",
  file: "Download receipt file",
} as const;

/** A saved email has its own, sandboxed route; a photo, PDF or other file uses `/file`. */
const routeFor = (kind: ReceiptKind) => (kind === "email" ? "email" : "file");

/** The owner-checked route that serves a saved receipt's copy. */
export const receiptFileHref = (receiptId: string, kind: ReceiptKind) =>
  `/api/receipts/${receiptId}/${routeFor(kind)}`;

/** The same for a receipt an AI attached to an item waiting for review. */
export const pendingReceiptFileHref = (pendingId: string, kind: ReceiptKind) =>
  `/api/receipts/pending/${pendingId}/${routeFor(kind)}`;

/**
 * Opens and downloads a saved receipt: its photo, the PDF from the email, or
 * the email itself. `href` is the owner-checked route that serves it; the
 * download link adds `?download=1`. A photo opens at `photoHref` when given
 * (its own image route). A receipt with only details
 * (nothing to open) shows a plain paperclip.
 */
export function ReceiptLinks({
  href,
  photoHref,
  kind,
  label,
  className,
}: {
  href: string;
  photoHref?: string;
  kind: ReceiptKind;
  /** What the receipt is for, e.g. the expense's description. */
  label: string;
  className?: string;
}) {
  if (kind === "details") {
    return (
      <span
        className={cn("text-muted-foreground", className)}
        title="Receipt details saved (no photo or file)"
      >
        <Paperclip
          className="size-3.5"
          aria-label="Receipt details saved, no photo or file"
        />
      </span>
    );
  }
  const Icon = ICONS[kind];
  const what = receiptKindLabel(kind);
  if (kind === "file") {
    // Another kind of file can't be shown, only downloaded.
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <a
          href={`${href}?download=1`}
          download
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Download ${what} for ${label}`}
          title={VIEW_TITLES.file}
        >
          <Icon className="size-3.5" />
        </a>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <a
        href={kind === "photo" && photoHref ? photoHref : href}
        target="_blank"
        rel="noopener"
        className="text-muted-foreground hover:text-foreground"
        aria-label={`View ${what} for ${label}`}
        title={VIEW_TITLES[kind]}
      >
        <Icon className="size-3.5" />
      </a>
      <a
        href={`${href}?download=1`}
        download
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Download ${what} for ${label}`}
        title={`Download ${what}`}
      >
        <Download className="size-3.5" />
      </a>
    </span>
  );
}
