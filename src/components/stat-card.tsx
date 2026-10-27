import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const headingClass =
  "flex items-center justify-between text-muted-foreground text-sm";

/**
 * A stat card's label and icon. With `href` the whole row is one link to that
 * section's page: same look, a subtle hover/focus state, and a 44px-tall tap
 * area (the negative margin keeps the card's layout unchanged).
 */
export function StatCardHeading({
  label,
  icon: Icon,
  href,
}: {
  label: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
    </>
  );

  if (!href) return <div className={headingClass}>{content}</div>;

  return (
    <Link
      href={href}
      aria-label={typeof label === "string" ? `Go to ${label}` : undefined}
      className={cn(
        headingClass,
        "-mx-2 -my-3 min-h-11 gap-2 rounded-md px-2 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&>span]:underline-offset-4 hover:[&>span]:underline",
      )}
    >
      {content}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: LucideIcon;
  /** Makes the label and icon a link to this section's page. */
  href?: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <StatCardHeading label={label} icon={icon} href={href} />
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
