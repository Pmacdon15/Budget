"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MonthTotals } from "@/lib/data";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { monthLabel } from "@/lib/month";

const config = {
  income: { label: "Take-home", color: "oklch(0.65 0.15 160)" },
  fixed: { label: "Fixed bills", color: "oklch(0.60 0.16 260)" },
  variable: { label: "Spending", color: "oklch(0.75 0.14 70)" },
  net: { label: "Left over", color: "var(--foreground)" },
} satisfies ChartConfig;

export function HistoryChart({ history }: { history: MonthTotals[] }) {
  const data = history.map((h) => ({
    month: monthLabel(h.month, "short"),
    income: h.incomeCents / 100,
    fixed: h.fixedCents / 100,
    variable: h.variableCents / 100,
    net: h.netCents / 100,
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatMoneyCompact(v * 100)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex w-full items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
                    {formatMoney(Math.round(Number(value) * 100))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="income"
          fill="var(--color-income)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="fixed"
          stackId="spent"
          fill="var(--color-fixed)"
          maxBarSize={28}
        />
        <Bar
          dataKey="variable"
          stackId="spent"
          fill="var(--color-variable)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          dataKey="net"
          type="monotone"
          stroke="var(--color-net)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
