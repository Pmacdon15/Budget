import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryBars } from "@/components/charts/category-bars";
import { HistoryChart } from "@/components/charts/history-chart";
import { IncomeTrendChart } from "@/components/charts/income-trend-chart";
import { SpendingDonut } from "@/components/charts/spending-donut";
import { totalsFor } from "@/lib/budget";
import type { CategoryTotal } from "@/lib/types";

const categories: CategoryTotal[] = [
  {
    category: "Housing",
    fixedCents: 150_000,
    variableCents: 0,
    totalCents: 150_000,
  },
  {
    category: "Groceries",
    fixedCents: 0,
    variableCents: 50_000,
    totalCents: 50_000,
  },
];

const history = ["2026-08", "2026-09", "2026-10"].map((month) =>
  totalsFor(month, [], [], []),
);

describe("SpendingDonut", () => {
  it("lists each category with its share and amount", () => {
    render(<SpendingDonut categories={categories} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Housing")).toBeVisible();
    expect(within(items[0] as HTMLElement).getByText("75%")).toBeVisible();
    expect(
      within(items[0] as HTMLElement).getByText("$1,500.00"),
    ).toBeVisible();
    expect(within(items[1] as HTMLElement).getByText("25%")).toBeVisible();
    expect(within(items[1] as HTMLElement).getByText("$500.00")).toBeVisible();
  });
});

describe("charts", () => {
  it.each([
    ["CategoryBars", () => <CategoryBars categories={categories} />],
    ["CategoryBars (empty)", () => <CategoryBars categories={[]} />],
    ["HistoryChart", () => <HistoryChart history={history} />],
    ["IncomeTrendChart", () => <IncomeTrendChart history={history} />],
  ])("%s renders inside a chart container", (_name, chart) => {
    const { container } = render(chart());
    expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
  });

  it("sizes the category bars to the number of categories", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...categories[0],
      category: `Cat ${i}`,
    })) as CategoryTotal[];
    const { container } = render(<CategoryBars categories={many} />);
    const chart = container.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(chart?.style.height).toBe("288px");
  });

  it("keeps a minimum height for few categories", () => {
    const { container } = render(<CategoryBars categories={categories} />);
    const chart = container.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(chart?.style.height).toBe("160px");
  });
});
