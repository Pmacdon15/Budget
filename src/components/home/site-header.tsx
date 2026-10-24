import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

/** Header for signed-out pages. Mirrors the app header's height and width. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <Logo />
          <span>Budget</span>
        </Link>
        <nav aria-label="Account" className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({ size: "lg", className: "px-3" })}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
