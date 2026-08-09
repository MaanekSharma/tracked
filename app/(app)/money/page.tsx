import { calculateMonthlySpending, calculateNetWorth, calculateSavingsRate, normalizeSubscriptionCost } from "@/lib/calculations";
import { getAccounts, getBills, getBudgetCategories, getCurrentBudgets, getMonthlyTransactions, getPlaidItems, getSubscriptions, getTransactions } from "@/lib/data";
import { money, percentage } from "@/lib/utils";
import { AccountManager, BillsManager, BudgetManager, SubscriptionsManager, TransactionManager } from "@/features/money/money-components";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = {
    q: typeof params.q === "string" ? params.q : undefined,
    type: typeof params.type === "string" ? params.type : undefined,
    category: typeof params.category === "string" ? params.category : undefined,
  };

  const [accounts, categories, budgets, transactions, monthlyTransactions, bills, subscriptions, plaidItems] = await Promise.all([
    getAccounts(true),
    getBudgetCategories(true),
    getCurrentBudgets(),
    getTransactions(filters),
    getMonthlyTransactions(),
    getBills(true),
    getSubscriptions(),
    getPlaidItems(),
  ]);

  const monthlySpending = calculateMonthlySpending(monthlyTransactions);
  const savingsRate = calculateSavingsRate(monthlyTransactions);
  const subscriptionMonthly = subscriptions
    .filter((subscription) => subscription.active)
    .reduce((total, subscription) => total + normalizeSubscriptionCost(subscription).monthly, 0);

  return (
    <>
      <PageHeader title="Money" description="Financial tracking for accounts, spending, budgets, bills, subscriptions, and synced transactions." />
      <PageNotice notice={params.notice} error={params.error} />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Net worth" value={money(calculateNetWorth(accounts))} detail="Credit cards reduce this total" />
        <StatCard label="Month spending" value={money(monthlySpending)} detail="Expenses only, transfers excluded" />
        <StatCard label="Savings rate" value={savingsRate === null ? "No income" : percentage(savingsRate)} detail="Income minus expenses" />
        <StatCard label="Subscriptions" value={money(subscriptionMonthly)} detail="Monthly equivalent" />
      </section>

      <section className="mt-6 grid gap-6">
        <AccountManager accounts={accounts} plaidItems={plaidItems} />
        <TransactionManager accounts={accounts} categories={categories} transactions={transactions} filters={filters} />
        <BudgetManager categories={categories} budgets={budgets} transactions={monthlyTransactions} />
        <BillsManager accounts={accounts} categories={categories} bills={bills} />
        <SubscriptionsManager accounts={accounts} categories={categories} subscriptions={subscriptions} />
      </section>
    </>
  );
}
