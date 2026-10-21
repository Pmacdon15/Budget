import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span>{label}</span>
          <Icon className="size-4" />
        </div>
        <div
          className={cn(
            "font-semibold text-2xl tabular-nums tracking-tight",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "negative" && "text-rose-600 dark:text-rose-400",
          )}
        >
          {value}
        </div>
        {hint ? (
          <div className="text-muted-foreground text-xs">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
