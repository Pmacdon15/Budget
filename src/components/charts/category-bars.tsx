"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { categoryColor } from "@/lib/categories";
import type { CategoryTotal } from "@/lib/data";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

const config = { total: { label: "Spent" } } satisfies ChartConfig;

export function CategoryBars({ categories }: { categories: CategoryTotal[] }) {
  const data = categories.map((c) => ({
    category: c.category,
    total: c.totalCents / 100,
    fill: categoryColor(c.category),
  }));

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(160, data.length * 36) }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <YAxis
          dataKey="category"
          type="category"
          tickLine={false}
          axisLine={false}
          width={104}
        />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatMoneyCompact(v * 100)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <span className="font-medium font-mono tabular-nums">
                  {formatMoney(Math.round(Number(value) * 100))}
                </span>
              )}
            />
          }
        />
        <Bar dataKey="total" radius={4} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.category} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
