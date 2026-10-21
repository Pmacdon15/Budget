"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addMonths, currentMonth, monthLabel, resolveMonth } from "@/lib/month";

export function MonthSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const month = resolveMonth(params.get("month"));
  const thisMonth = currentMonth();

  const go = (target: string) => {
    const next = new URLSearchParams(params);
    if (target === thisMonth) next.delete("month");
    else next.set("month", target);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        onClick={() => go(addMonths(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <button
        type="button"
        onClick={() => go(thisMonth)}
        title={month === thisMonth ? "Current month" : "Jump to current month"}
        className="min-w-24 rounded-md px-1 text-center font-medium text-sm tabular-nums hover:text-primary sm:min-w-32"
      >
        <span className="sm:hidden">{monthLabel(month, "short")}</span>
        <span className="hidden sm:inline">{monthLabel(month)}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        onClick={() => go(addMonths(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
