import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
      fill="none"
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 21.5 13.5 16l3.5 3 6-7.5"
        className="stroke-primary-foreground"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="11.5" r="1.8" className="fill-primary-foreground" />
    </svg>
  );
}
