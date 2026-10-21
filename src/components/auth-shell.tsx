import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo className="size-10" />
        <h1 className="font-semibold text-2xl tracking-tight">Budget</h1>
        <p className="max-w-xs text-muted-foreground text-sm">
          Fixed bills, take-home pay and spending — one clear picture every
          month.
        </p>
      </div>
      <Suspense
        fallback={
          <Skeleton className="h-[420px] w-full max-w-[400px] rounded-xl" />
        }
      >
        {children}
      </Suspense>
    </main>
  );
}
