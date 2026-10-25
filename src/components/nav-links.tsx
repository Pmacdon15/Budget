"use client";

import {
  CalendarRange,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/fixed", label: "Fixed bills", icon: CalendarRange },
  { href: "/income", label: "Take-home", icon: Wallet },
  { href: "/expenses", label: "Spending", icon: Receipt },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/goals", label: "Goals", icon: PiggyBank },
  { href: "/report", label: "Report", icon: FileText },
] as const;

/**
 * The section links without the selected month. It reads only the pathname,
 * so it renders in the static shell; use it as the `<Suspense>` fallback for
 * `NavLinks`, which adds `?month=` once the URL is known.
 */
export function StaticNavLinks({
  className,
  query = "",
}: {
  className?: string;
  query?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Section links that keep the selected month. Reads the URL, so wrap it in `<Suspense>`. */
export function NavLinks({ className }: { className?: string }) {
  const month = useSearchParams().get("month");
  return (
    <StaticNavLinks
      className={className}
      query={month ? `?month=${month}` : ""}
    />
  );
}
