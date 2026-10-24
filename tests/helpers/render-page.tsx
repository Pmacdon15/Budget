import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type AsyncComponent = (props: unknown) => Promise<ReactNode>;

/**
 * Pages render `<Suspense><AsyncContent /></Suspense>`. This awaits the async
 * server component inside and renders its output to HTML, the way Next.js
 * streams it in, so a test can check what a signed-in user would see.
 */
export async function renderPage(page: ReactElement) {
  const inner = (page.props as { children: ReactElement }).children;
  const content = await (inner.type as AsyncComponent)(inner.props);
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{content}</QueryClientProvider>,
  );
}

export const searchParams = (month?: string) =>
  Promise.resolve(month ? { month } : {});

/** The visible text of rendered HTML, with whitespace collapsed. */
export function textOf(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
