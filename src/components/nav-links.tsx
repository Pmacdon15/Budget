"use client";

import {
  CalendarRange,
  FileText,
  LayoutDashboard,
  Receipt,
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
  { href: "/report", label: "Report", icon: FileText },
] as const;

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  const month = useSearchParams().get("month");
  const query = month ? `?month=${month}` : "";

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
