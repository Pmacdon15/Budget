import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ConnectAiCard } from "@/components/review/connect-ai-card";
import { PendingList } from "@/components/review/pending-list";
import { ListSkeleton } from "@/components/skeletons";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Review" };

/*
 * Not async: the heading, description and the connect card's frame are in the
 * static shell. The pending items and the API keys each wait for the URL in
 * their own `<Suspense>` hole.
 */
export default function ReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Review"
        description="Expenses and new accounts your AI assistant found. Nothing counts until you approve it."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <PendingList month={month} />
        </Suspense>
        <ConnectAiCard month={month} />
      </div>
    </>
  );
}
