import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Fallbacks for the small `<Suspense>` holes on each page. They sit in the
 * prerendered static shell, so each one reserves the space its content needs.
 */

/** A short run of text inside a heading or sentence, e.g. a month name. */
export function TextSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("inline-block h-[0.9em] w-32 align-middle", className)}
    />
  );
}

/** Header buttons that need the selected month before they can open. */
export function ActionsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Skeleton key={i} className="h-8 w-28" />
      ))}
    </>
  );
}

/** A `StatCard` with its label and icon, waiting for the number. */
export function StatCardSkeleton({
  label,
  icon: Icon,
}: {
  label: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Card size="sm" aria-busy="true">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span>{label}</span>
          {Icon ? <Icon className="size-4" /> : null}
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3.5 w-24" />
      </CardContent>
    </Card>
  );
}

/** Rows of a list or table body. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 py-1" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}

/** A chart area. Pass the chart's own height class so nothing shifts. */
export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton aria-busy="true" className={cn("h-60 w-full", className)} />;
}

/** A page body made of a wide card and a narrow card, like most pages here. */
export function SplitCardsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-5" aria-busy="true">
      <Skeleton className="h-80 rounded-xl lg:col-span-3" />
      <Skeleton className="h-80 rounded-xl lg:col-span-2" />
    </div>
  );
}
