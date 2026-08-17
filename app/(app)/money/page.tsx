import {
  calculateMonthlyCashFlow,
  calculateSpendingComparison,
  financialMonthRange,
  groupSpendingByCategory,
  summarizeAccounts,
  transactionsInRange,
} from "@/lib/calculations";
import {
  getAccounts,
  getBills,
  getBudgetCategories,
  getCurrentBudgets,
  getInvestmentHoldings,
  getInvestmentTransactions,
  getPlaidItems,
  getSubscriptions,
  getTransactions,
} from "@/lib/data";
import { AccountManager, BillsManager, BudgetManager, SubscriptionsManager } from "@/features/money/money-components";
import { MoneyExperience } from "@/features/money/money-experience";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currentMonth = financialMonthRange();
  const previousMonth = financialMonthRange(new Date(), -1);
  const [
    accounts,
    categories,
    budgets,
    transactions,
    bills,
    subscriptions,
    plaidItems,
    investmentHoldings,
    investmentTransactions,
  ] = await Promise.all([
    getAccounts(true),
    getBudgetCategories(true),
    getCurrentBudgets(new Date(`${currentMonth.from}T12:00:00.000Z`)),
    getTransactions({}, undefined, 1000),
    getBills(true),
    getSubscriptions(),
    getPlaidItems(),
    getInvestmentHoldings(),
    getInvestmentTransactions(),
  ]);

  const accountSummary = summarizeAccounts(accounts);
  const currentTransactions = transactionsInRange(transactions, currentMonth);
  const currentCashFlow = calculateMonthlyCashFlow(currentTransactions);
  const previousCashFlow = calculateMonthlyCashFlow(transactions, previousMonth);
  const spendingCategories = groupSpendingByCategory(currentTransactions, categories);
  const financialOverview = {
    netWorth: accountSummary.netWorth,
    cash: accountSummary.cash,
    investments: accountSummary.investments,
    creditCardDebt: accountSummary.creditCardDebt,
    income: currentCashFlow.income,
    spending: currentCashFlow.spending,
    cashFlow: currentCashFlow.cashFlow,
    spendingComparison: calculateSpendingComparison(currentCashFlow.spending, previousCashFlow.spending),
    previousMonthLabel: previousMonth.label.replace(/\s+\d{4}$/, ""),
  };

  return (
    <>
      <PageHeader
        title="Money"
        description="A live view of what you own, what you owe, and where this month’s money is going."
      />
      <PageNotice notice={params.notice} error={params.error} />

      <MoneyExperience
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        currentMonth={currentMonth}
        financialOverview={financialOverview}
        spendingCategories={spendingCategories}
        accountsSection={(
          <AccountManager
            accounts={accounts}
            plaidItems={plaidItems}
            investmentHoldings={investmentHoldings}
            investmentTransactions={investmentTransactions}
          />
        )}
      />

      <section className="mt-6 grid gap-6" aria-label="Planning and recurring money tools">
        <BudgetManager categories={categories} budgets={budgets} transactions={currentTransactions} />
        <BillsManager accounts={accounts} categories={categories} bills={bills} />
        <SubscriptionsManager accounts={accounts} categories={categories} subscriptions={subscriptions} />
      </section>
    </>
  );
}
