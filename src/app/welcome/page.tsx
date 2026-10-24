import type { Metadata } from "next";
import Link from "next/link";
import { AppPreview } from "@/components/home/app-preview";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: { absolute: "Budget — know what’s left before the month does" },
  description:
    "Enter your fixed bills once, log take-home as it lands and spending as it happens. Budget does the subtraction and gives you a report at the end of the month.",
};

const FEATURES = [
  {
    title: "Fixed bills",
    body: "Rent, phone, insurance, subscriptions. Add them once with a due day and they carry into every month.",
  },
  {
    title: "Take-home",
    body: "Log each paycheque as it lands. The month keeps a running total next to your three-month average.",
  },
  {
    title: "Spending",
    body: "Groceries, gas, nights out. Log one-off purchases by category and see where the rest went.",
  },
  {
    title: "Monthly report",
    body: "What came in, what went out and what was left, compared with last month. Print it or download a CSV.",
  },
] as const;

const STEPS = [
  {
    title: "Add your take-home",
    body: "What actually hits your account this month, after tax.",
  },
  {
    title: "Add fixed bills",
    body: "Anything that repeats monthly. You only do this once.",
  },
  {
    title: "Log spending",
    body: "As it happens. Your overview and report build themselves.",
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 md:pt-20">
          <div className="flex max-w-2xl flex-col gap-5">
            <h1 className="text-balance font-semibold text-4xl tracking-tight sm:text-5xl">
              Know what’s left before the month does.
            </h1>
            <p className="text-lg text-muted-foreground">
              Fixed bills, take-home pay and spending in one place. Budget does
              the subtraction every time something changes, and gives you a
              report when the month ends.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Get started
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "px-4",
                })}
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
          <AppPreview />
        </section>

        {/* Features */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1fr_2fr]">
            <div className="flex flex-col gap-3">
              <h2 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                Built around one month at a time.
              </h2>
              <p className="text-muted-foreground">
                No bank connection to set up and nothing to categorize after the
                fact. You write it down; the numbers stay right.
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="grid content-start gap-2">
                  <dt className="font-medium">{feature.title}</dt>
                  <Separator />
                  <dd className="text-muted-foreground text-sm">
                    {feature.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Steps + CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <div className="mb-8 flex flex-col gap-2">
              <h2 className="font-semibold text-2xl tracking-tight sm:text-3xl">
                Three steps and you’re set.
              </h2>
              <p className="text-muted-foreground">
                The same three steps you’ll see the first time you sign in.
              </p>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="mb-2 flex size-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
                        {index + 1}
                      </div>
                      <CardTitle>{step.title}</CardTitle>
                      <CardDescription>{step.body}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Create your account
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({
                  variant: "ghost",
                  size: "lg",
                  className: "px-4",
                })}
              >
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
