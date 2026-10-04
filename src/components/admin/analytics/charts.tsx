"use client"

import type { ReactNode } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompactMoney, formatDay, type DailyPoint } from "@/lib/admin-analytics"
import { formatPrice } from "@/lib/catalogue"
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-rules"
import { cn } from "@/lib/utils"

// One blue for every single-series chart (revenue, orders, categories), stepped for each theme.
const SERIES = { light: "#2a78d6", dark: "#3987e5" }
// Rows that aren't a real category ("Deleted products") recede to grey.
const OTHER = { light: "#a3a3a3", dark: "#737373" }

/**
 * The order status colours as chart fills: the same hues as `ORDER_STATUS_STYLES`' badges, at a
 * step strong enough for a bar on either theme.
 */
export const STATUS_CHART_COLORS: Record<OrderStatus, { light: string; dark: string }> = {
  pending: { light: "#d97706", dark: "#f59e0b" },
  processing: { light: "#0284c7", dark: "#38bdf8" },
  shipped: { light: "#7c3aed", dark: "#a78bfa" },
  delivered: { light: "#059669", dark: "#34d399" },
  cancelled: OTHER,
  rejected: { light: "#dc2626", dark: "#f87171" },
}

const countFormat = new Intl.NumberFormat("en-US")

/** One tooltip line: colour key, name and value. */
function TooltipRow({ color, name, value }: { color: string; name: ReactNode; value: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{name}</span>
      <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

const dayLabel = (_: unknown, payload: readonly { payload?: { date?: string } }[]) =>
  payload[0]?.payload?.date ? formatDay(payload[0].payload.date, true) : null

const revenueConfig = { revenueCents: { label: "Revenue", theme: SERIES } } satisfies ChartConfig
const ordersConfig = { orders: { label: "Orders", theme: SERIES } } satisfies ChartConfig

type ChartProps = { className?: string }

/** Revenue per day as an area. */
export function DailyRevenueChart({
  data,
  currency,
  className,
}: ChartProps & { data: DailyPoint[]; currency: string }) {
  return (
    <ChartContainer config={revenueConfig} className={cn("aspect-auto h-64 w-full", className)}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="analytics-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenueCents)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-revenueCents)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => formatDay(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => formatCompactMoney(value, currency)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={dayLabel}
              formatter={(value) => (
                <TooltipRow color="var(--color-revenueCents)" name="Revenue" value={formatPrice(Number(value), currency)} />
              )}
            />
          }
        />
        <Area
          dataKey="revenueCents"
          type="linear"
          stroke="var(--color-revenueCents)"
          strokeWidth={2}
          fill="url(#analytics-revenue-fill)"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Standing orders per day as columns. */
export function DailyOrdersChart({ data, className }: ChartProps & { data: DailyPoint[] }) {
  return (
    <ChartContainer config={ordersConfig} className={cn("aspect-auto h-64 w-full", className)}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => formatDay(value)}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={dayLabel}
              formatter={(value) => (
                <TooltipRow color="var(--color-orders)" name="Orders" value={countFormat.format(Number(value))} />
              )}
            />
          }
        />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  )
}

export type CategoryBar = { name: string; revenueCents: number; other: boolean }

const categoryConfig = { revenueCents: { label: "Sales", theme: SERIES }, other: { label: "Other", theme: OTHER } } satisfies ChartConfig

/** Sales per category as horizontal bars, highest first, each labelled with its amount. */
export function CategoryChart({ data, currency, className }: ChartProps & { data: CategoryBar[]; currency: string }) {
  return (
    <ChartContainer
      config={categoryConfig}
      className={cn("aspect-auto w-full", className)}
      style={{ height: Math.max(120, data.length * 44 + 16) }}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={120} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <TooltipRow
                  color={item.payload.other ? "var(--color-other)" : "var(--color-revenueCents)"}
                  name={item.payload.name}
                  value={formatPrice(Number(value), currency)}
                />
              )}
            />
          }
        />
        <Bar dataKey="revenueCents" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((row) => (
            <Cell key={row.name} fill={row.other ? "var(--color-other)" : "var(--color-revenueCents)"} />
          ))}
          <LabelList
            dataKey="revenueCents"
            position="right"
            className="fill-foreground"
            fontSize={12}
            formatter={(value: unknown) => formatCompactMoney(Number(value), currency)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

const statusConfig = Object.fromEntries(
  ORDER_STATUSES.map((status) => [status, { label: ORDER_STATUS_LABELS[status], theme: STATUS_CHART_COLORS[status] }]),
) satisfies ChartConfig

/** Orders per status as horizontal bars in the status colours, each named on the axis and labelled with its count. */
export function StatusChart({ counts, className }: ChartProps & { counts: Record<OrderStatus, number> }) {
  const data = ORDER_STATUSES.map((status) => ({ status, label: ORDER_STATUS_LABELS[status], count: counts[status] }))
  return (
    <ChartContainer config={statusConfig} className={cn("aspect-auto h-64 w-full", className)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={84} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <TooltipRow
                  color={`var(--color-${item.payload.status})`}
                  name={item.payload.label}
                  value={countFormat.format(Number(value))}
                />
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((row) => (
            <Cell key={row.status} fill={`var(--color-${row.status})`} />
          ))}
          <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** A bare revenue line for the dashboard card: no axes or grid, the card carries the numbers. */
export function RevenueSparkline({ data, className }: ChartProps & { data: DailyPoint[] }) {
  return (
    <ChartContainer config={revenueConfig} className={cn("aspect-auto h-16 w-full", className)}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenueCents)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-revenueCents)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="revenueCents"
          type="linear"
          stroke="var(--color-revenueCents)"
          strokeWidth={2}
          fill="url(#dashboard-revenue-fill)"
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
