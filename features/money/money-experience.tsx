"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  ListFilter,
  PencilLine,
  Plus,
  ReceiptText,
  Search,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
  updateTransactionMetadataAction,
} from "@/features/actions";
import {
  effectiveTransactionType,
  filterTransactions,
  type FinancialMonthRange,
  type SpendingCategory,
} from "@/lib/calculations";
import { cn, formatDate, money, todayISO } from "@/lib/utils";
import type { Account, BudgetCategory, Transaction, TransactionType } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, FormGrid, HiddenRedirect, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";
const UNCATEGORIZED = "__uncategorized__";
const PAGE_SIZE = 50;

type FinancialOverviewData = {
  netWorth: number;
  cash: number;
  investments: number;
  creditCardDebt: number;
  income: number;
  spending: number;
  cashFlow: number;
  spendingComparison: {
    percentChange: number;
    direction: "up" | "down" | "flat";
  } | null;
  previousMonthLabel: string;
};

type MoneyExperienceProps = {
  accounts: Account[];
  categories: BudgetCategory[];
  transactions: Transaction[];
  currentMonth: FinancialMonthRange;
  financialOverview: FinancialOverviewData;
  spendingCategories: SpendingCategory[];
  accountsSection: React.ReactNode;
};

function transactionName(transaction: Transaction) {
  return transaction.merchant_name || transaction.merchant || transaction.description || transaction.original_description || "Transaction";
}

function accountOptions(accounts: Account[]) {
  return [
    { value: "", label: accounts.length ? "Select account" : "Create an account first" },
    ...accounts.filter((account) => !account.archived).map((account) => ({ value: account.id, label: account.name })),
  ];
}

function categoryOptions(categories: BudgetCategory[], includeArchived = false) {
  return [
    { value: "", label: "Uncategorized" },
    ...categories.filter((category) => includeArchived || !category.archived).map((category) => ({
      value: category.id,
      label: `${category.group_name} · ${category.name}${category.archived ? " (archived)" : ""}`,
    })),
  ];
}

const transactionTypeOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

function signedMoney(value: number) {
  if (value === 0) return money(0);
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

function FinancialOverview({ data }: { data: FinancialOverviewData }) {
  const comparison = data.spendingComparison;
  const spendingImproved = comparison?.direction === "down";

  return (
    <section aria-labelledby="financial-overview-title">
      <Card className="overflow-hidden border-primary/25 bg-card/95">
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)]">
          <div className="relative overflow-hidden border-b p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
            <p id="financial-overview-title" className="relative text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Financial overview
            </p>
            <p className="relative mt-5 font-mono text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              {money(data.netWorth)}
            </p>
            <p className="relative mt-2 text-sm text-muted-foreground">Net worth · assets less liabilities</p>
            <div className="relative mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Included accounts only
            </div>
          </div>

          <div className="grid">
            <div className="grid grid-cols-2 border-b md:grid-cols-3">
              <OverviewMetric icon={Banknote} label="Cash" value={money(data.cash)} className="border-r" />
              <OverviewMetric icon={Landmark} label="Investments" value={money(data.investments)} className="md:border-r" />
              <OverviewMetric
                icon={CreditCard}
                label="Credit card debt"
                value={money(data.creditCardDebt)}
                className="col-span-2 border-t md:col-span-1 md:border-t-0"
                tone={data.creditCardDebt > 0 ? "debt" : "default"}
              />
            </div>
            <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <MonthlyMetric label="Income this month" value={money(data.income)} tone="positive" />
              <MonthlyMetric
                label="Spending this month"
                value={money(data.spending)}
                detail={comparison ? (
                  <span className={cn("inline-flex items-center gap-1", spendingImproved ? "text-primary" : comparison.direction === "up" ? "text-destructive" : "text-muted-foreground")}>
                    {comparison.direction === "down" ? <ArrowDownRight className="size-3.5" /> : comparison.direction === "up" ? <ArrowUpRight className="size-3.5" /> : null}
                    {Math.abs(comparison.percentChange).toLocaleString("en-CA", { maximumFractionDigits: 0 })}% {comparison.direction === "flat" ? "unchanged" : spendingImproved ? "less" : "more"} vs {data.previousMonthLabel}
                  </span>
                ) : undefined}
              />
              <MonthlyMetric label="Net cash flow" value={signedMoney(data.cashFlow)} tone={data.cashFlow >= 0 ? "positive" : "negative"} />
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  className,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
  tone?: "default" | "debt";
}) {
  return (
    <div className={cn("min-w-0 p-4 sm:p-5", className)}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <p className={cn("mt-2 truncate font-mono text-xl font-semibold tracking-tight", tone === "debt" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

function MonthlyMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="min-w-0 p-4 sm:p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 font-mono text-lg font-semibold tracking-tight",
        tone === "positive" && "text-primary",
        tone === "negative" && "text-destructive",
      )}>
        {value}
      </p>
      {detail ? <div className="mt-1 text-[0.7rem] font-semibold">{detail}</div> : null}
    </div>
  );
}

function ThisMonth({
  month,
  overview,
  categories,
  activeCategory,
  onCategoryChange,
}: {
  month: FinancialMonthRange;
  overview: FinancialOverviewData;
  categories: SpendingCategory[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
}) {
  const shownCategories = categories.slice(0, 8);

  return (
    <section aria-labelledby="this-month-title">
      <Card>
        <CardHeader className="gap-2 border-b sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{month.label}</p>
            <CardTitle id="this-month-title" className="mt-1 text-xl">This month</CardTitle>
            <CardDescription>Cash flow and the spending categories driving it.</CardDescription>
          </div>
          {activeCategory ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onCategoryChange("")}>
              <X className="size-4" />
              Clear category
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-7 p-5 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.28fr)]">
          <div className="divide-y rounded-lg border bg-background/70">
            <CashFlowRow label="Income" value={overview.income} icon={TrendingUp} tone="positive" />
            <CashFlowRow label="Spending" value={overview.spending} icon={TrendingDown} />
            <CashFlowRow label="Net cash flow" value={overview.cashFlow} icon={WalletCards} signed tone={overview.cashFlow >= 0 ? "positive" : "negative"} />
          </div>

          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Spending by category</h3>
                <p className="text-xs text-muted-foreground">Select a row to filter the transactions below.</p>
              </div>
              <Badge variant="muted">{categories.length} categories</Badge>
            </div>
            {shownCategories.length ? (
              <div className="space-y-2">
                {shownCategories.map((category, index) => {
                  const categoryKey = category.categoryId ?? UNCATEGORIZED;
                  const active = activeCategory === categoryKey;
                  return (
                    <button
                      key={categoryKey}
                      type="button"
                      onClick={() => onCategoryChange(active ? "" : categoryKey)}
                      aria-pressed={active}
                      className={cn(
                        "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                        active ? "border-primary bg-accent text-accent-foreground" : "bg-background hover:border-primary/45 hover:bg-accent/50",
                      )}
                    >
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 bg-primary/10 transition-all group-hover:bg-primary/15"
                        style={{ width: `${Math.max(category.share, 2)}%` }}
                      />
                      <span className="relative flex min-w-0 items-center gap-3">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{category.name}</span>
                          <span className="block text-[0.7rem] text-muted-foreground">
                            {category.transactionCount} transaction{category.transactionCount === 1 ? "" : "s"} · {category.share.toLocaleString("en-CA", { maximumFractionDigits: 0 })}%
                          </span>
                        </span>
                      </span>
                      <span className="relative font-mono text-sm font-semibold">{money(category.amount)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm font-semibold">No included spending yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Expenses will appear here as Plaid syncs or you add them.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function CashFlowRow({
  label,
  value,
  icon: Icon,
  signed,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  signed?: boolean;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </span>
      <span className={cn(
        "font-mono text-lg font-semibold",
        tone === "positive" && "text-primary",
        tone === "negative" && "text-destructive",
      )}>
        {signed ? signedMoney(value) : money(value)}
      </span>
    </div>
  );
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function TransactionExplorer({
  accounts,
  categories,
  transactions,
  currentMonth,
  categoryFilter,
  onCategoryFilterChange,
  month,
  onMonthChange,
}: {
  accounts: Account[];
  categories: BudgetCategory[];
  transactions: Transaction[];
  currentMonth: FinancialMonthRange;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [visibleLimit, setVisibleLimit] = React.useState(PAGE_SIZE);
  const selectedTransaction = transactions.find((transaction) => transaction.id === selectedId) ?? null;
  const months = React.useMemo(() => {
    const keys = new Set(transactions.map((transaction) => transaction.transaction_date.slice(0, 7)));
    keys.add(currentMonth.key);
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [currentMonth.key, transactions]);
  const filteredTransactions = React.useMemo(
    () => filterTransactions(transactions, {
      search,
      accountId: accountId || undefined,
      categoryId: categoryFilter || undefined,
      month,
    }),
    [accountId, categoryFilter, month, search, transactions],
  );
  const visibleTransactions = filteredTransactions.slice(0, visibleLimit);
  const hasFilters = Boolean(search || accountId || categoryFilter || month !== ALL);

  function clearFilters() {
    setSearch("");
    setAccountId("");
    onCategoryFilterChange("");
    onMonthChange(ALL);
    setVisibleLimit(PAGE_SIZE);
  }

  function useCategoryFilter(value: string) {
    onCategoryFilterChange(value === ALL ? "" : value);
    setVisibleLimit(PAGE_SIZE);
  }

  return (
    <section id="transactions" aria-labelledby="transactions-title" className="scroll-mt-20">
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle id="transactions-title" className="flex items-center gap-2 text-xl">
              <ReceiptText className="size-5 text-primary" />
              Transactions
            </CardTitle>
            <CardDescription>
              {filteredTransactions.length.toLocaleString("en-CA")} matching transaction{filteredTransactions.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add transaction
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b bg-muted/20 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.3fr)_minmax(160px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,0.75fr)_auto]">
              <label className="relative block">
                <span className="sr-only">Search transactions</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleLimit(PAGE_SIZE);
                  }}
                  placeholder="Search merchant or description"
                  className="pl-9"
                />
              </label>
              <Select value={accountId || ALL} onValueChange={(value) => {
                setAccountId(value === ALL ? "" : value);
                setVisibleLimit(PAGE_SIZE);
              }}>
                <SelectTrigger aria-label="Filter by account">
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All accounts</SelectItem>
                  {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter || ALL} onValueChange={useCategoryFilter}>
                <SelectTrigger aria-label="Filter by category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
                  {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={month} onValueChange={(value) => {
                onMonthChange(value);
                setVisibleLimit(PAGE_SIZE);
              }}>
                <SelectTrigger aria-label="Filter by month">
                  <SelectValue placeholder="All months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All months</SelectItem>
                  {months.map((key) => <SelectItem key={key} value={key}>{monthLabel(key)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="md:col-span-2 xl:col-span-1">
                <X className="size-4" />
                Clear
              </Button>
            </div>
            {categoryFilter ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <ListFilter className="size-3.5 text-primary" />
                Category filter is active; month, account, and search filters continue to apply.
              </div>
            ) : null}
          </div>

          {visibleTransactions.length ? (
            <div className="divide-y">
              {visibleTransactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} onOpen={() => setSelectedId(transaction.id)} />
              ))}
              {visibleLimit < filteredTransactions.length ? (
                <div className="flex justify-center p-4">
                  <Button type="button" variant="outline" onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, filteredTransactions.length - visibleLimit)} more
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No transactions match" description="Clear a filter or choose another month to keep browsing." />
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionEditor
        transaction={selectedTransaction}
        accounts={accounts}
        categories={categories}
        open={Boolean(selectedTransaction)}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
      />
      <AddTransactionDialog
        open={adding}
        onOpenChange={setAdding}
        accounts={accounts}
        categories={categories}
      />
    </section>
  );
}

function TransactionRow({ transaction, onOpen }: { transaction: Transaction; onOpen: () => void }) {
  const type = effectiveTransactionType(transaction);
  const category = transaction.budget_categories?.name ?? "Uncategorized";
  const amountPrefix = type === "income" ? "+" : type === "expense" ? "−" : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-3 bg-background/30 p-4 text-left transition-colors hover:bg-accent/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      aria-label={`Open ${transactionName(transaction)} transaction`}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-card",
          type === "income" && "border-primary/35 bg-primary/10 text-primary",
        )}>
          {type === "income" ? <TrendingUp className="size-4" /> : type === "transfer" ? <ArrowUpRight className="size-4" /> : <ReceiptText className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{transactionName(transaction)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDate(transaction.transaction_date, "MMM d, yyyy")}</span>
            <span aria-hidden="true">·</span>
            <span>{transaction.accounts?.name ?? "Account"}</span>
            <span aria-hidden="true">·</span>
            <span>{category}</span>
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {transaction.pending ? <Badge variant="muted">Pending</Badge> : null}
            {type === "transfer" ? <Badge variant="secondary">Transfer</Badge> : null}
            {transaction.excluded_from_spending ? <Badge variant="outline">Excluded</Badge> : null}
            {transaction.type_override ? <Badge variant="outline">Classification edited</Badge> : null}
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
        <span className={cn(
          "font-mono text-sm font-semibold tabular-nums sm:text-base",
          type === "income" && "text-primary",
          type === "expense" && transaction.excluded_from_spending && "text-muted-foreground line-through",
        )}>
          {amountPrefix}{money(transaction.amount, true)}
        </span>
        <PencilLine className="size-4 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}

function TransactionEditor({
  transaction,
  accounts,
  categories,
  open,
  onOpenChange,
}: {
  transaction: Transaction | null;
  accounts: Account[];
  categories: BudgetCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!transaction) return null;
  const effectiveType = effectiveTransactionType(transaction);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={transaction.source === "plaid" ? "secondary" : "muted"}>{transaction.source === "plaid" ? "Plaid" : "Manual"}</Badge>
            {transaction.pending ? <Badge variant="muted">Pending</Badge> : null}
          </div>
          <DialogTitle className="text-xl">{transactionName(transaction)}</DialogTitle>
          <DialogDescription>
            {formatDate(transaction.transaction_date)} · {transaction.accounts?.name ?? "Account"} · {money(transaction.amount, true)}
          </DialogDescription>
        </DialogHeader>

        {transaction.source === "plaid" ? (
          <PlaidMetadataForm transaction={transaction} categories={categories} effectiveType={effectiveType} />
        ) : (
          <ManualTransactionForm transaction={transaction} accounts={accounts} categories={categories} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlaidMetadataForm({
  transaction,
  categories,
  effectiveType,
}: {
  transaction: Transaction;
  categories: BudgetCategory[];
  effectiveType: TransactionType;
}) {
  return (
    <form action={updateTransactionMetadataAction} className="space-y-4">
      <HiddenRedirect to="/money" />
      <input type="hidden" name="id" value={transaction.id} />
      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        Bank-supplied amount, date, merchant, account, and pending state stay read-only. Your TRACKED category, classification, exclusion, and notes survive future syncs.
      </div>
      <FormGrid>
        <SelectField
          label="Classification"
          name="classification"
          defaultValue={transaction.type_override ?? "automatic"}
          options={[
            { value: "automatic", label: `Use bank classification (${transaction.type})` },
            ...transactionTypeOptions,
          ]}
        />
        <SelectField label="Category" name="category_id" defaultValue={transaction.category_id} options={categoryOptions(categories, true)} />
      </FormGrid>
      <CheckboxField
        label={effectiveType === "expense" ? "Exclude from spending and category totals" : "Keep excluded if this becomes an expense"}
        name="excluded_from_spending"
        defaultChecked={transaction.excluded_from_spending}
      />
      <TextareaField label="Notes" name="notes" defaultValue={transaction.notes} placeholder="Add context only TRACKED should manage" />
      <div className="flex justify-end">
        <Button type="submit">Save transaction</Button>
      </div>
    </form>
  );
}

function ManualTransactionForm({
  transaction,
  accounts,
  categories,
}: {
  transaction: Transaction;
  accounts: Account[];
  categories: BudgetCategory[];
}) {
  return (
    <>
      <form action={updateTransactionAction} className="space-y-4">
        <HiddenRedirect to="/money" />
        <input type="hidden" name="id" value={transaction.id} />
        <FormGrid>
          <SelectField label="Account" name="account_id" defaultValue={transaction.account_id} options={accountOptions(accounts)} required />
          <SelectField label="Type" name="type" defaultValue={transaction.type} options={transactionTypeOptions} />
          <SelectField label="Destination (transfers)" name="destination_account_id" defaultValue={transaction.destination_account_id} options={accountOptions(accounts)} />
          <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={transaction.amount} required />
          <SelectField label="Category" name="category_id" defaultValue={transaction.category_id} options={categoryOptions(categories, true)} />
          <TextField label="Merchant / payee" name="merchant" defaultValue={transaction.merchant} />
          <TextField label="Transaction date" name="transaction_date" type="date" defaultValue={transaction.transaction_date} required />
          <TextField label="Posted date" name="posted_date" type="date" defaultValue={transaction.posted_date} />
          <TextField label="Description" name="description" defaultValue={transaction.description} />
        </FormGrid>
        <TextareaField label="Notes" name="notes" defaultValue={transaction.notes} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField label="Pending" name="pending" defaultChecked={transaction.pending} />
          <CheckboxField label="Exclude from spending totals" name="excluded_from_spending" defaultChecked={transaction.excluded_from_spending} />
        </div>
        <div className="flex justify-end">
          <Button type="submit">Save transaction</Button>
        </div>
      </form>
      <form
        action={deleteTransactionAction}
        className="border-t pt-4"
        onSubmit={(event) => {
          if (!window.confirm("Delete this manual transaction? This cannot be undone.")) event.preventDefault();
        }}
      >
        <HiddenRedirect to="/money" />
        <input type="hidden" name="id" value={transaction.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">Delete transaction</Button>
      </form>
    </>
  );
}

function AddTransactionDialog({
  open,
  onOpenChange,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: BudgetCategory[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Record a manual income, expense, or transfer.</DialogDescription>
        </DialogHeader>
        <form action={createTransactionAction} className="space-y-4">
          <HiddenRedirect to="/money" />
          <FormGrid>
            <SelectField label="Account" name="account_id" options={accountOptions(accounts)} required />
            <SelectField label="Type" name="type" defaultValue="expense" options={transactionTypeOptions} />
            <SelectField label="Destination (transfers)" name="destination_account_id" options={accountOptions(accounts)} />
            <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
            <SelectField label="Category" name="category_id" options={categoryOptions(categories)} />
            <TextField label="Merchant / payee" name="merchant" />
            <TextField label="Transaction date" name="transaction_date" type="date" defaultValue={todayISO()} required />
            <TextField label="Posted date" name="posted_date" type="date" />
            <TextField label="Description" name="description" />
          </FormGrid>
          <TextareaField label="Notes" name="notes" />
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField label="Pending" name="pending" />
            <CheckboxField label="Exclude from spending totals" name="excluded_from_spending" />
          </div>
          <div className="flex justify-end">
            <Button type="submit">Add transaction</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoneyExperience({
  accounts,
  categories,
  transactions,
  currentMonth,
  financialOverview,
  spendingCategories,
  accountsSection,
}: MoneyExperienceProps) {
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [monthFilter, setMonthFilter] = React.useState(currentMonth.key);

  function selectCategory(categoryId: string) {
    setCategoryFilter(categoryId);
    if (categoryId) {
      setMonthFilter(currentMonth.key);
      window.setTimeout(() => document.getElementById("transactions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  return (
    <div className="grid gap-6">
      <FinancialOverview data={financialOverview} />
      <ThisMonth
        month={currentMonth}
        overview={financialOverview}
        categories={spendingCategories}
        activeCategory={categoryFilter}
        onCategoryChange={selectCategory}
      />
      {accountsSection}
      <TransactionExplorer
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        currentMonth={currentMonth}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
    </div>
  );
}
