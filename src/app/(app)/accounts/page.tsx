import { Suspense } from "react";
import {
  AccountCards,
  AccountsHeaderActions,
  AccountsSummary,
  TransferList,
  TransfersCard,
} from "@/components/accounts/account-list";
import { PageHeader } from "@/components/page-header";
import {
  ActionsSkeleton,
  ListSkeleton,
  SplitCardsSkeleton,
} from "@/components/skeletons";
import { monthFrom, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Accounts" };

/*
 * Not async: the heading, description and the transfers card's frame are in
 * the static shell. The buttons, summary, accounts and transfers each wait
 * for the URL in their own `<Suspense>` hole.
 */
export default function AccountsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const month = monthFrom(searchParams);

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Chequing, credit cards and lines of credit. Only chequing counts toward what's left to spend."
      >
        <Suspense fallback={<ActionsSkeleton count={1} />}>
          <AccountsHeaderActions month={month} />
        </Suspense>
      </PageHeader>

      <Suspense fallback={null}>
        <AccountsSummary month={month} />
      </Suspense>

      <Suspense fallback={<SplitCardsSkeleton />}>
        <AccountCards month={month} />
      </Suspense>

      <TransfersCard>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <TransferList month={month} />
        </Suspense>
      </TransfersCard>
    </>
  );
}
