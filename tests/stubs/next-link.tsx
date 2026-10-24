import type { AnchorHTMLAttributes } from "react";

/** A plain anchor standing in for `next/link`, which needs a Next.js router. */
export default function Link({
  href,
  prefetch: _prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
}) {
  return <a href={href} {...props} />;
}
