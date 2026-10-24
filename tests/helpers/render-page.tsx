import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { prerender } from "react-dom/static";

// Pages render inside the app layout's `<main>`. A host parent also matters to
// React: an aborted prerender drops `<Suspense>` boundaries at the very root.
const wrap = (page: ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>
    <main>{page}</main>
  </QueryClientProvider>
);

/**
 * Renders a page the way a signed-in visitor gets it once streaming finishes:
 * every `<Suspense>` hole resolved, async server components and `.then()`
 * children included. An error thrown inside a hole (a redirect, say) rejects,
 * so tests can assert on it.
 */
export async function renderPage(page: ReactElement) {
  const errors: unknown[] = [];
  const { prelude } = await prerender(wrap(page), {
    onError: (error) => {
      errors.push(error);
    },
  });
  const html = await new Response(prelude).text();
  if (errors.length > 0) throw errors[0];
  return html;
}

/**
 * Renders only the static shell: request data (`searchParams`) never arrives,
 * so every hole shows its fallback, like the HTML `next build` prerenders.
 */
export async function renderShell(page: ReactElement) {
  const controller = new AbortController();
  const result = prerender(wrap(page), {
    signal: controller.signal,
    onError: () => {},
  });
  // Let everything that doesn't wait on the request finish, then stop.
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  const { prelude } = await result;
  return new Response(prelude).text();
}

export const searchParams = (month?: string) =>
  Promise.resolve(month ? { month } : {});

/** `searchParams` during prerendering: unknown until a request arrives. */
export const pendingSearchParams = () =>
  new Promise<Record<string, string>>(() => {});

/** The visible text of rendered HTML, with whitespace collapsed. */
export function textOf(html: string) {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<template[\s\S]*?<\/template>/g, " ")
      // React separates adjacent text with `<!-- -->` and marks boundaries with comments.
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
  );
}
