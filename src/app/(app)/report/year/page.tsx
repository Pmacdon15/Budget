import { FileText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import {
  ActionsSkeleton,
  ChartSkeleton,
  ListSkeleton,
  StatCardSkeleton,
  TextSkeleton,
} from "@/components/skeletons";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HEADLINES,
  YearBestWorst,
  YearCategories,
  YearChart,
  YearComparison,
  YearHeadline,
  YearMonths,
  YearPeriod,
  YearSwitcher,
} from "@/components/year-view/year-sections";
import { yearFrom } from "@/lib/schemas/year-view";
import type { SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata = { title: "Year view" };

/*
 * Not async: the heading, card titles and labels are in the static shell.
 * The year, each number, table and chart wait in their own `<Suspense>` hole.
 */
export default function YearViewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const year = yearFrom(searchParams);
  const link = cn(buttonVariants({ variant: "outline" }), "print:hidden");

  return (
    <>
      <PageHeader
        title={
          <>
            <Suspense fallback={<TextSkeleton className="w-16" />}>
              {year.then(String)}
            </Suspense>{" "}
            in review
          </>
        }
        description={
          <>
            Totals by month and category, your best and worst months, and how{" "}
            <Suspense fallback={<TextSkeleton className="w-24" />}>
              <YearPeriod year={year} />
            </Suspense>{" "}
            compares with the same months last year.
          </>
        }
      >
        <Suspense fallback={<ActionsSkeleton count={2} />}>
          <YearSwitcher year={year} />
        </Suspense>
        <Link href="/report" className={link}>
          <FileText /> Monthly report
        </Link>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </PageHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(Object.keys(HEADLINES) as (keyof typeof HEADLINES)[]).map(
            (kind) => (
              <Suspense
                key={kind}
                fallback={
                  <StatCardSkeleton
                    label={HEADLINES[kind].label}
                    icon={HEADLINES[kind].icon}
                  />
                }
              >
                <YearHeadline year={year} kind={kind} />
              </Suspense>
            ),
          )}
        </div>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Month by month</CardTitle>
            <CardDescription>
              Take-home, fixed bills, spending and what was left each month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartSkeleton className="h-72" />}>
              <YearChart year={year} />
            </Suspense>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="break-inside-avoid lg:col-span-3">
            <CardHeader>
              <CardTitle>Compared with last year</CardTitle>
              <CardDescription>
                The same months a year earlier, and your monthly average.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-4">
              <Suspense fallback={<ListSkeleton rows={6} />}>
                <YearComparison year={year} />
              </Suspense>
            </CardContent>
          </Card>
          <Card className="break-inside-avoid lg:col-span-2">
            <CardHeader>
              <CardTitle>Best and worst months</CardTitle>
              <CardDescription>By how much was left over.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ListSkeleton rows={3} />}>
                <YearBestWorst year={year} />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Totals by month</CardTitle>
            <CardDescription>Open a month for its full report.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-4">
            <Suspense fallback={<ListSkeleton rows={12} />}>
              <YearMonths year={year} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Totals by category</CardTitle>
            <CardDescription>
              Fixed bills and spending combined, against last year.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-4">
            <Suspense fallback={<ListSkeleton rows={6} />}>
              <YearCategories year={year} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
