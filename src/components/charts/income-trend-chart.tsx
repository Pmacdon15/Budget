"use client";

import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { monthLabel } from "@/lib/month";
import type { MonthTotals } from "@/lib/types";

const config = {
  income: { label: "Take-home", color: "oklch(0.65 0.15 160)" },
  rolling: { label: "3-month average", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function IncomeTrendChart({ history }: { history: MonthTotals[] }) {
  const data = history.map((h, i) => {
    const window = history
      .slice(0, i + 1)
      .filter((x) => x.incomeCents > 0)
      .slice(-3);
    const rolling =
      window.length > 0
        ? window.reduce((a, b) => a + b.incomeCents, 0) / window.length
        : null;
    return {
      month: monthLabel(h.month, "short"),
      income: h.incomeCents / 100,
      rolling: rolling === null ? null : Math.round(rolling) / 100,
    };
  });

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="fill-income" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-income)"
              stopOpacity={0.5}
            />
            <stop
              offset="95%"
              stopColor="var(--color-income)"
              stopOpacity={0.05}
            />
          </linearGradient>
        </defs>
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
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-medium font-mono text-foreground tabular-nums">
                    {formatMoney(Math.round(Number(value) * 100))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="income"
          type="monotone"
          stroke="var(--color-income)"
          strokeWidth={2}
          fill="url(#fill-income)"
        />
        <Line
          dataKey="rolling"
          type="monotone"
          stroke="var(--color-rolling)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
        />
      </AreaChart>
    </ChartContainer>
  );
}
