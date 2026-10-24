"use client";

import { Cell, Label, Pie, PieChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import type { CategoryTotal } from "@/lib/types";

export function SpendingDonut({ categories }: { categories: CategoryTotal[] }) {
  const data = categories.map((c) => ({
    category: categoryLabel(c.category),
    value: c.totalCents,
    fill: categoryColor(c.category),
  }));
  const total = data.reduce((a, b) => a + b.value, 0);
  const config = Object.fromEntries(
    data.map((d) => [d.category, { label: d.category, color: d.fill }]),
  ) satisfies ChartConfig;

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,220px)_1fr]">
      <ChartContainer
        config={config}
        className="mx-auto aspect-square w-full max-w-[220px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as
                | (typeof data)[number]
                | undefined;
              if (!active || !item) return null;
              return (
                <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{item.category}</div>
                  <div className="text-muted-foreground tabular-nums">
                    {formatMoney(item.value)} ·{" "}
                    {Math.round((item.value / total) * 100)}%
                  </div>
                </div>
              );
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="category"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 2 : 0}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.category} fill={d.fill} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null;
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 6}
                      className="fill-foreground font-semibold text-xl"
                    >
                      {formatMoneyCompact(total)}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 16}
                      className="fill-muted-foreground text-xs"
                    >
                      spent
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid gap-2 text-sm">
        {data.map((d) => (
          <li key={d.category} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.fill }}
            />
            <span className="truncate">{d.category}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {Math.round((d.value / total) * 100)}%
            </span>
            <span className="w-24 text-right font-medium tabular-nums">
              {formatMoney(d.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
