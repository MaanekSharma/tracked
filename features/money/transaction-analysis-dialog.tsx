"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChartNoAxesCombined,
  CircleDollarSign,
  Minus,
  ReceiptText,
  Repeat2,
  Store,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  analyzeTransactions,
  calculateComparablePeriodComparison,
  type MerchantBreakdown,
} from "@/lib/transaction-analysis";
import { cn, formatDate, money } from "@/lib/utils";
import type { BudgetCategory, Transaction } from "@/types/domain";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};

function signedMoney(value: number) {
  if (value === 0) return money(0);
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

function AnalysisMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="min-w-0 bg-background p-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-2 truncate font-mono text-xl font-semibold tracking-tight tabular-nums",
        tone === "positive" && "text-primary",
        tone === "negative" && "text-destructive",
      )}>
        {value}
      </p>
      <p className="mt-1 truncate text-[0.7rem] text-muted-foreground">{detail}</p>
    </div>
  );
}

function AnalysisPanel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-background/55">
      <div className="flex items-start gap-3 border-b p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RankedRows({ rows }: { rows: MerchantBreakdown[] }) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No included spending in this view.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row, index) => (
        <div key={row.key} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md border p-3">
          <span
            className="pointer-events-none absolute inset-y-0 left-0 bg-primary/[0.07]"
            style={{ width: `${Math.max(row.share, 2)}%` }}
          />
          <span className="relative flex min-w-0 items-center gap-3">
            <span className="font-mono text-[0.68rem] font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span className="block text-[0.7rem] text-muted-foreground">
                {row.transactionCount} transaction{row.transactionCount === 1 ? "" : "s"} · {row.share.toLocaleString("en-CA", { maximumFractionDigits: 0 })}%
              </span>
            </span>
          </span>
          <span className="relative font-mono text-sm font-semibold tabular-nums">{money(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export function TransactionAnalysisDialog({
  open,
  onOpenChange,
  transactions,
  categories,
  periodLabel,
  currentMonth,
  previousMonth,
  previousTransactions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  categories: BudgetCategory[];
  periodLabel: string;
  currentMonth?: string;
  previousMonth?: string;
  previousTransactions?: Transaction[];
}) {
  const analysis = React.useMemo(
    () => analyzeTransactions(transactions, categories),
    [categories, transactions],
  );
  const { summary } = analysis;
  const categoryChartData = analysis.categories.slice(0, 7);
  const comparison = React.useMemo(
    () => currentMonth && previousMonth && previousTransactions
      ? calculateComparablePeriodComparison(
          transactions,
          previousTransactions,
          currentMonth,
          previousMonth,
        )
      : analysis.comparison,
    [analysis.comparison, currentMonth, previousMonth, previousTransactions, transactions],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-5 p-0 [&>button]:hidden">
        <DialogHeader className="sticky top-0 z-20 overflow-hidden border-b bg-popover/95 p-5 pr-6 backdrop-blur sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
              <ChartNoAxesCombined className="size-4" />
            </span>
            <Badge variant="secondary">{periodLabel}</Badge>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" className="ml-auto">
                <X className="size-4" />
                Close
              </Button>
            </DialogClose>
          </div>
          <DialogTitle className="relative mt-2 text-2xl tracking-tight">Transaction analysis</DialogTitle>
          <DialogDescription className="relative max-w-3xl">
            A deterministic view of all {summary.transactionCount.toLocaleString("en-CA")} matching transactions. Pending transactions follow the same rules as the Money totals.
          </DialogDescription>
        </DialogHeader>

        {summary.transactionCount === 0 ? (
          <div className="px-5 pb-6">
            <EmptyState
              title="Nothing to analyze"
              description="Adjust the transaction filters, then analyze the matching history again."
            />
          </div>
        ) : (
          <div className="grid gap-5 px-5 pb-6 sm:px-6">
            <section aria-label="Transaction summary" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
              <AnalysisMetric label="Total spending" value={money(summary.totalSpending)} detail="Included expenses" />
              <AnalysisMetric label="Total income" value={money(summary.totalIncome)} detail="Included income" tone="positive" />
              <AnalysisMetric
                label="Net cash flow"
                value={signedMoney(summary.netCashFlow)}
                detail="Income less spending"
                tone={summary.netCashFlow >= 0 ? "positive" : "negative"}
              />
              <AnalysisMetric label="Monthly average" value={money(summary.averageMonthlySpending)} detail="Across represented months" />
              <AnalysisMetric label="Average transaction" value={money(summary.averageTransactionSize, true)} detail="Included income + expenses" />
              <AnalysisMetric
                label="Largest expense"
                value={summary.largestExpense ? money(summary.largestExpense.amount, true) : "—"}
                detail={summary.largestExpense
                  ? `${summary.largestExpense.name} · ${formatDate(summary.largestExpense.transactionDate, "MMM d")}`
                  : "No included expenses"}
              />
              <AnalysisMetric
                label="Transactions"
                value={summary.transactionCount.toLocaleString("en-CA")}
                detail="All matching records"
              />
              <AnalysisMetric
                label="Spending categories"
                value={analysis.categories.length.toLocaleString("en-CA")}
                detail="With included expenses"
              />
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <AnalysisPanel
                title="Spending by category"
                description="Top categories by included expense value"
                icon={CircleDollarSign}
              >
                {categoryChartData.length ? (
                  <figure>
                    <figcaption className="sr-only">Bar chart of spending by category. Exact values are listed in the Top categories section.</figcaption>
                    <div className="h-64 w-full" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
                          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={92}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          />
                          <Tooltip
                            cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
                            contentStyle={tooltipStyle}
                            formatter={(value) => [money(Number(value), true), "Spending"]}
                          />
                          <Bar dataKey="amount" fill="var(--chart-1)" radius={[0, 5, 5, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </figure>
                ) : (
                  <p className="py-20 text-center text-sm text-muted-foreground">No included spending to chart.</p>
                )}
              </AnalysisPanel>

              <AnalysisPanel
                title="Monthly cash flow"
                description="Income and spending across the filtered history"
                icon={CalendarRange}
              >
                {analysis.months.length ? (
                  <figure>
                    <figcaption className="sr-only">Monthly income and spending across the filtered transaction history.</figcaption>
                    <div className="mb-2 flex flex-wrap items-center gap-4 text-[0.7rem] font-semibold text-muted-foreground" aria-hidden="true">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Income
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Spending
                      </span>
                    </div>
                    <div className="h-60 w-full" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analysis.months} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
                          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={28}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value, name) => [money(Number(value), true), name === "income" ? "Income" : "Spending"]}
                          />
                          <Area type="monotone" dataKey="spending" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.16} strokeWidth={2} />
                          <Area type="monotone" dataKey="income" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.08} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="sr-only">
                      <caption>Monthly cash flow values</caption>
                      <thead>
                        <tr><th>Month</th><th>Income</th><th>Spending</th><th>Net cash flow</th></tr>
                      </thead>
                      <tbody>
                        {analysis.months.map((month) => (
                          <tr key={month.month}>
                            <th>{month.label}</th>
                            <td>{money(month.income, true)}</td>
                            <td>{money(month.spending, true)}</td>
                            <td>{signedMoney(month.netCashFlow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </figure>
                ) : (
                  <p className="py-20 text-center text-sm text-muted-foreground">No monthly activity to chart.</p>
                )}
              </AnalysisPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <AnalysisPanel title="Top categories" description="Amount, frequency, and share of spending" icon={ReceiptText}>
                <div className="space-y-2">
                  {analysis.categories.slice(0, 6).map((category, index) => (
                    <div key={category.categoryId ?? "uncategorized"} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md border p-3">
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 bg-primary/[0.07]"
                        style={{ width: `${Math.max(category.share, 2)}%` }}
                      />
                      <span className="relative flex min-w-0 items-center gap-3">
                        <span className="font-mono text-[0.68rem] font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{category.name}</span>
                          <span className="block text-[0.7rem] text-muted-foreground">
                            {category.transactionCount} transaction{category.transactionCount === 1 ? "" : "s"} · {category.share.toLocaleString("en-CA", { maximumFractionDigits: 0 })}%
                          </span>
                        </span>
                      </span>
                      <span className="relative font-mono text-sm font-semibold tabular-nums">{money(category.amount)}</span>
                    </div>
                  ))}
                  {!analysis.categories.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No included spending in this view.</p>
                  ) : null}
                </div>
              </AnalysisPanel>

              <AnalysisPanel title="Top merchants" description="Merchants ranked by included spending" icon={Store}>
                <RankedRows rows={analysis.merchants} />
              </AnalysisPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <AnalysisPanel title="Month over month" description="Selected or latest month against its prior month" icon={comparison?.direction === "down" ? ArrowDownRight : comparison?.direction === "up" ? ArrowUpRight : Minus}>
                {comparison ? (
                  <div className="flex items-center justify-between gap-5">
                    <div>
                      <p className="text-xs text-muted-foreground">{comparison.currentLabel} vs {comparison.previousLabel}</p>
                      <p className={cn(
                        "mt-2 font-mono text-3xl font-semibold tracking-tight",
                        comparison.direction === "down" && "text-primary",
                        comparison.direction === "up" && "text-destructive",
                      )}>
                        {comparison.percentChange > 0 ? "+" : ""}{comparison.percentChange.toLocaleString("en-CA", { maximumFractionDigits: 1 })}%
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {comparison.direction === "flat" ? "Spending was unchanged." : `Spending was ${comparison.direction === "down" ? "lower" : "higher"}.`}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="font-mono text-sm font-semibold text-foreground">{money(comparison.currentSpending)}</p>
                      <p className="mt-1">from {money(comparison.previousSpending)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">
                    A percentage appears only when a prior comparable month exists and has matching spending.
                  </p>
                )}
              </AnalysisPanel>

              <AnalysisPanel title="Recurring / frequent merchants" description="Repeated merchant names; a signal, not subscription detection" icon={Repeat2}>
                {analysis.frequentMerchants.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {analysis.frequentMerchants.slice(0, 8).map((merchant) => (
                      <div key={merchant.key} className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-muted/15 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{merchant.name}</p>
                          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{money(merchant.totalAmount)} total activity</p>
                        </div>
                        <Badge variant="muted">{merchant.transactionCount}×</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">No merchant appears more than once in this filtered view.</p>
                )}
              </AnalysisPanel>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
