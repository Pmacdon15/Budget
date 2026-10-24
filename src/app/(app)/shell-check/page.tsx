import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

/**
 * A canary for the static shell. This page reads nothing from the request,
 * so it must prerender completely: `next build` lists it as ○ (Static).
 *
 * `ensureStatic = "navigation"` makes the build fail if anything above it, in
 * the root or app layout (the Clerk provider, the nav bar, the month switcher),
 * starts reading request data outside a client component. If that happens,
 * every page in the app loses its static shell, so fix the layout rather than
 * this page. `tests/build/static-shell.test.ts` checks the result as well.
 */
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  title: "Static shell check",
  robots: { index: false, follow: false },
};

export default function ShellCheckPage() {
  return (
    <PageHeader
      title="Static shell check"
      description="This page has no request-time data, so it is served entirely from the build. If it ever isn't, a shared layout is making every page wait for the server."
    />
  );
}
