import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-5" />
          <span>
            Budget · fixed bills, take-home and spending, by the month
          </span>
        </div>
        <div className="flex gap-4">
          <Link href="/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="hover:text-foreground">
            Create an account
          </Link>
        </div>
      </div>
    </footer>
  );
}
