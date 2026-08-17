import {
  Archive,
  ChartNoAxesCombined,
  ChevronDown,
  CircleEllipsis,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  ReceiptText,
  Repeat,
  Trash2,
} from "lucide-react";
import {
  createAccountAction,
  createBillAction,
  createCategoryAction,
  createSubscriptionAction,
  createTransactionAction,
  deleteAccountAction,
  deleteBillAction,
  deleteSubscriptionAction,
  deleteTransactionAction,
  markBillPaidAction,
  keepPlaidAccountSeparateAction,
  linkPlaidAccountAction,
  updateAccountAction,
  updateBillAction,
  updateCategoryAction,
  updateSubscriptionAction,
  updateTransactionAction,
  upsertBudgetAction,
} from "@/features/actions";
import { CalendarRecurrenceFields } from "@/features/calendar/calendar-form-fields";
import { PlaidAccountActions, PlaidConnectButton } from "@/features/plaid/plaid-components";
import {
  classifyAccount,
  getBudgetProgress,
  isInvestmentAccount,
  isLiabilityAccount,
  normalizeSubscriptionCost,
  type AccountGroup,
} from "@/lib/calculations";
import { formatDate, money, monthStartISO, todayISO } from "@/lib/utils";
import {
  accountTypeLabels,
  billingFrequencyLabels,
  type Account,
  type Bill,
  type Budget,
  type BudgetCategory,
  type InvestmentHolding,
  type InvestmentTransaction,
  type PlaidItem,
  type Subscription,
  type Transaction,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";

const accountTypeOptions = Object.entries(accountTypeLabels).map(([value, label]) => ({ value, label }));
const billingFrequencyOptions = Object.entries(billingFrequencyLabels).map(([value, label]) => ({ value, label }));
const transactionTypeOptions = [
  { value: "", label: "All types" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];
const transactionFormTypeOptions = transactionTypeOptions.filter((option) => option.value);

function accountOptions(accounts: Account[]) {
  return [
    { value: "", label: accounts.length ? "Select account" : "Create an account first" },
    ...accounts.filter((account) => !account.archived).map((account) => ({ value: account.id, label: account.name })),
  ];
}

function categoryOptions(categories: BudgetCategory[], includeAll = false) {
  return [
    { value: "", label: includeAll ? "All categories" : "Uncategorized" },
    ...categories.filter((category) => !category.archived).map((category) => ({
      value: category.id,
      label: `${category.group_name} - ${category.name}`,
    })),
  ];
}

function plaidStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "connected":
      return "Connected";
    case "login_required":
      return "Needs attention";
    case "error":
      return "Issue";
    case "disconnected":
      return "Disconnected";
    default:
      return "Manual";
  }
}

function plaidStatusVariant(status: string | null | undefined) {
  if (status === "connected") return "secondary";
  if (status === "login_required" || status === "error") return "destructive";
  return "muted";
}

function investmentStatusLabel(status: Account["investment_sync_status"]) {
  switch (status) {
    case "available":
      return "Investments connected";
    case "balance_only":
      return "Balance only";
    case "pending":
      return "Syncing";
    case "error":
      return "Needs attention";
    default:
      return null;
  }
}

function investmentStatusVariant(status: Account["investment_sync_status"]) {
  if (status === "available") return "secondary";
  if (status === "error") return "destructive";
  return "muted";
}

type AccountGroupKey = AccountGroup | "archived";
const accountGroupDefinitions = [
  {
    key: "cash",
    label: "Cash",
    description: "Everyday and reserve balances",
    icon: Landmark,
  },
  {
    key: "investments",
    label: "Investments",
    description: "Registered and non-registered holdings",
    icon: ChartNoAxesCombined,
  },
  {
    key: "credit",
    label: "Credit & debt",
    description: "Cards, loans, and borrowed balances",
    icon: CreditCard,
  },
  {
    key: "other",
    label: "Other",
    description: "Accounts outside the standard groups",
    icon: CircleEllipsis,
  },
  {
    key: "archived",
    label: "Archived",
    description: "Retained for historical records",
    icon: Archive,
  },
] as const;

function accountGroupKey(account: Account): AccountGroupKey {
  if (account.archived) return "archived";
  return classifyAccount(account);
}

function numericAccountBalance(account: Account) {
  const balance = Number(account.current_balance);
  return Number.isFinite(balance) ? balance : 0;
}

function accountPresentationBalance(account: Account) {
  const balance = numericAccountBalance(account);
  return isLiabilityAccount(account) ? -Math.abs(balance) : balance;
}

function accountGroupTotal(group: AccountGroupKey, accounts: Account[]) {
  return accounts
    .filter((account) => group === "archived" || account.include_in_net_worth)
    .reduce((total, account) => total + accountPresentationBalance(account), 0);
}

export function AccountManager({
  accounts,
  plaidItems,
  investmentHoldings,
  investmentTransactions,
}: {
  accounts: Account[];
  plaidItems: PlaidItem[];
  investmentHoldings: InvestmentHolding[];
  investmentTransactions: InvestmentTransaction[];
}) {
  const plaidItemById = new Map(plaidItems.map((item) => [item.id, item]));
  const holdingsByAccount = new Map<string, InvestmentHolding[]>();
  const transactionsByAccount = new Map<string, InvestmentTransaction[]>();
  for (const holding of investmentHoldings) {
    holdingsByAccount.set(holding.account_id, [...(holdingsByAccount.get(holding.account_id) ?? []), holding]);
  }
  for (const transaction of investmentTransactions) {
    transactionsByAccount.set(transaction.account_id, [...(transactionsByAccount.get(transaction.account_id) ?? []), transaction]);
  }
  const accountsByGroup = new Map<AccountGroupKey, Account[]>(
    accountGroupDefinitions.map((group) => [group.key, []]),
  );
  for (const account of accounts) {
    accountsByGroup.get(accountGroupKey(account))?.push(account);
  }
  const accountGroups = accountGroupDefinitions
    .map((group) => ({ ...group, accounts: accountsByGroup.get(group.key) ?? [] }))
    .filter((group) => group.accounts.length > 0);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="size-4 text-primary" />
            Accounts
          </CardTitle>
          <CardDescription>Balances are latest known or reconciled values used for net worth.</CardDescription>
        </div>
        <PlaidConnectButton
          existingInstitutions={plaidItems
            .filter((item) => item.status !== "disconnected" && item.institution_name)
            .map((item) => item.institution_name as string)}
        />
      </CardHeader>
      <CardContent className="space-y-5">
        <details className="group overflow-hidden rounded-lg border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Plus className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Add a manual account</p>
                <p className="text-sm text-muted-foreground">Track an account that is not connected through Plaid.</p>
              </div>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <form action={createAccountAction} className="border-t p-4">
            <HiddenRedirect to="/money" />
            <FormGrid>
              <TextField label="Name" name="name" required />
              <SelectField label="Type" name="type" defaultValue="chequing" options={accountTypeOptions} />
              <TextField label="Institution" name="institution" />
              <TextField label="Balance" name="current_balance" type="number" step="0.01" defaultValue={0} required />
              <TextField label="Balance as of" name="balance_as_of" type="date" defaultValue={todayISO()} required />
              <TextField label="Credit limit" name="credit_limit" type="number" step="0.01" />
            </FormGrid>
            <div className="mt-4 grid gap-3">
              <TextareaField label="Notes" name="notes" />
              <CheckboxField label="Include in net worth" name="include_in_net_worth" defaultChecked />
            </div>
            <Button type="submit" className="mt-4">Add account</Button>
          </form>
        </details>

        {accounts.length ? (
          <div className="space-y-4">
            {accountGroups.map((group) => {
              const GroupIcon = group.icon;
              const groupTotal = accountGroupTotal(group.key, group.accounts);
              return (
                <section key={group.key} className="min-w-0 overflow-hidden rounded-lg border bg-card/40">
                  <div className="flex flex-col gap-3 border-b bg-muted/25 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                        <GroupIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold">{group.label}</h3>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
                        {group.accounts.length} account{group.accounts.length === 1 ? "" : "s"} · {group.key === "archived" ? "Archived balance" : "Included total"}
                      </p>
                      <p className="font-black tabular-nums">{money(groupTotal)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 p-2 sm:p-3">
                    {group.accounts.map((account) => {
                      const plaidItem = account.plaid_item_uuid ? plaidItemById.get(account.plaid_item_uuid) : null;
                      const plaidStatus = plaidItem?.status ?? account.plaid_connection_status;
                      const institutionName = account.institution_name ?? account.institution ?? plaidItem?.institution_name;
                      const accountHoldings = holdingsByAccount.get(account.id) ?? [];
                      const investmentActivity = transactionsByAccount.get(account.id) ?? [];
                      const isInvestment = isInvestmentAccount(account);
                      const investmentLabel = isInvestment && plaidStatus !== "disconnected"
                        ? investmentStatusLabel(account.investment_sync_status)
                        : null;
                      const reconciliationCandidates = accounts.filter((candidate) =>
                        !candidate.archived && !candidate.plaid_account_id && candidate.type === account.type && candidate.id !== account.id,
                      );
                      return (
                        <details key={account.id} className="min-w-0 rounded-md border bg-background p-3 sm:p-4">
                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                              <div className="min-w-0">
                                <p className="break-words font-semibold">{account.name}</p>
                                <p className="mt-0.5 break-words text-sm text-muted-foreground">
                                  {accountTypeLabels[account.type]}{institutionName ? ` - ${institutionName}` : ""}
                                  {account.mask ? ` - ****${account.mask}` : ""} - As of {formatDate(account.balance_as_of)}
                                </p>
                              </div>
                              <div className="min-w-0 sm:text-right">
                                <p className="font-black tabular-nums">{money(accountPresentationBalance(account))}</p>
                                <div className="mt-1 flex flex-wrap gap-1 sm:justify-end">
                                  {account.plaid_account_id ? (
                                    <Badge variant={plaidStatusVariant(plaidStatus)}>Plaid {plaidStatusLabel(plaidStatus)}</Badge>
                                  ) : null}
                                  {investmentLabel ? (
                                    <Badge variant={investmentStatusVariant(account.investment_sync_status)}>{investmentLabel}</Badge>
                                  ) : null}
                                  {!account.include_in_net_worth && !account.archived ? <Badge variant="muted">Not in net worth</Badge> : null}
                                  {account.archived ? <Badge variant="muted">Archived</Badge> : null}
                                </div>
                              </div>
                            </div>
                          </summary>
                  {account.plaid_account_id ? (
                    <div className="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Institution</p>
                        <p>{institutionName ?? "Plaid"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Available</p>
                        <p>{account.available_balance === null ? "Not reported" : money(account.available_balance)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Last sync</p>
                        <p>{formatDate(account.last_synced_at, "MMM d, h:mm a")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Plaid account</p>
                        <p className="capitalize">{account.plaid_account_type ?? "Other"}{account.account_subtype ? ` / ${account.account_subtype}` : ""}</p>
                      </div>
                    </div>
                  ) : null}
                  {account.reconciliation_status === "needs_review" ? (
                    <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-sm font-semibold">Possible existing account</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This Plaid account is temporarily excluded from net worth. Link it to the matching manual account, or keep it separate.
                      </p>
                      {reconciliationCandidates.length ? (
                        <form action={linkPlaidAccountAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <HiddenRedirect to="/money" />
                          <input type="hidden" name="source_plaid_account_id" value={account.id} />
                          <div className="min-w-0 flex-1">
                            <SelectField
                              label="Manual account"
                              name="target_manual_account_id"
                              options={reconciliationCandidates.map((candidate) => ({
                                value: candidate.id,
                                label: `${candidate.name}${candidate.institution ? ` - ${candidate.institution}` : ""}`,
                              }))}
                              required
                            />
                          </div>
                          <Button type="submit" size="sm">Link accounts</Button>
                        </form>
                      ) : null}
                      <form action={keepPlaidAccountSeparateAction} className="mt-2">
                        <HiddenRedirect to="/money" />
                        <input type="hidden" name="id" value={account.id} />
                        <Button type="submit" variant="outline" size="sm">Keep separate</Button>
                      </form>
                    </div>
                  ) : null}
                  {isInvestment && account.plaid_account_id ? (
                    <div className="mt-4 rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">Holdings</p>
                          <p className="text-xs text-muted-foreground">
                            {account.investment_sync_status === "available"
                              ? `${accountHoldings.length} position${accountHoldings.length === 1 ? "" : "s"} reported by Plaid`
                              : "Holdings unavailable through this institution"}
                          </p>
                        </div>
                      </div>
                      {account.investment_sync_status === "available" && accountHoldings.length ? (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[680px] text-left text-sm">
                            <thead className="text-xs uppercase text-muted-foreground">
                              <tr className="border-b">
                                <th className="pb-2 pr-4 font-semibold">Security</th>
                                <th className="pb-2 pr-4 text-right font-semibold">Quantity</th>
                                <th className="pb-2 pr-4 text-right font-semibold">Market value</th>
                                <th className="pb-2 pr-4 text-right font-semibold">Cost basis</th>
                                <th className="pb-2 text-right font-semibold">Gain / loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accountHoldings.map((holding) => {
                                const marketValue = Number(holding.institution_value);
                                const costBasis = holding.cost_basis === null ? null : Number(holding.cost_basis);
                                return (
                                  <tr key={holding.id} className="border-b last:border-0">
                                    <td className="py-2 pr-4">
                                      <p className="font-medium">{holding.investment_securities?.ticker_symbol ?? holding.investment_securities?.name ?? "Security"}</p>
                                      {holding.investment_securities?.ticker_symbol && holding.investment_securities.name ? (
                                        <p className="text-xs text-muted-foreground">{holding.investment_securities.name}</p>
                                      ) : null}
                                    </td>
                                    <td className="py-2 pr-4 text-right tabular-nums">{Number(holding.quantity).toLocaleString("en-CA", { maximumFractionDigits: 6 })}</td>
                                    <td className="py-2 pr-4 text-right font-medium tabular-nums">{money(marketValue)}</td>
                                    <td className="py-2 pr-4 text-right tabular-nums">{costBasis === null ? "Not reported" : money(costBasis)}</td>
                                    <td className="py-2 text-right tabular-nums">{costBasis === null ? "—" : money(marketValue - costBasis)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {investmentActivity.length ? (
                        <div className="mt-4 border-t pt-3">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Recent investment activity</p>
                          <div className="mt-2 space-y-2">
                            {investmentActivity.slice(0, 5).map((transaction) => (
                              <div key={transaction.id} className="flex items-start justify-between gap-3 text-sm">
                                <div className="min-w-0 flex-1">
                                  <p className="break-words font-medium">{transaction.name}</p>
                                  <p className="text-xs capitalize text-muted-foreground">{formatDate(transaction.transaction_date)} · {transaction.transaction_subtype}</p>
                                </div>
                                <p className="shrink-0 font-medium tabular-nums">{money(transaction.amount)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <form action={updateAccountAction} className="mt-4 border-t pt-4">
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={account.id} />
                    <FormGrid>
                      <TextField label="Name" name="name" defaultValue={account.name} required />
                      <SelectField label="Type" name="type" defaultValue={account.type} options={accountTypeOptions} />
                      <TextField label="Institution" name="institution" defaultValue={account.institution} />
                      <TextField label="Balance" name="current_balance" type="number" step="0.01" defaultValue={account.current_balance} required />
                      <TextField label="Balance as of" name="balance_as_of" type="date" defaultValue={account.balance_as_of} required />
                      <TextField label="Credit limit" name="credit_limit" type="number" step="0.01" defaultValue={account.credit_limit} />
                    </FormGrid>
                    <div className="mt-4 grid gap-3">
                      <TextareaField label="Notes" name="notes" defaultValue={account.notes} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <CheckboxField label="Include in net worth" name="include_in_net_worth" defaultChecked={account.include_in_net_worth} />
                        <CheckboxField label="Archived" name="archived" defaultChecked={account.archived} />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button type="submit">Save account</Button>
                    </div>
                  </form>
                  {account.plaid_item_uuid && plaidStatus !== "disconnected" ? (
                    <div className="mt-3 border-t pt-3">
                      <PlaidAccountActions plaidItemId={account.plaid_item_uuid} institutionName={institutionName} status={plaidStatus} />
                    </div>
                  ) : (
                    <form action={deleteAccountAction} className="mt-2">
                      <HiddenRedirect to="/money" />
                      <input type="hidden" name="id" value={account.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </form>
                  )}
                        </details>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No accounts yet" description="Add chequing, savings, investment, cash, and credit card accounts." />
        )}
      </CardContent>
    </Card>
  );
}

export function TransactionManager({
  accounts,
  categories,
  transactions,
  filters,
}: {
  accounts: Account[];
  categories: BudgetCategory[];
  transactions: Transaction[];
  filters: { q?: string; type?: string; category?: string };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptText className="size-4 text-primary" />
          Transactions
        </CardTitle>
        <CardDescription>Manual and synced transactions share the same budget and dashboard totals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createTransactionAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/money" />
          <FormGrid>
            <SelectField label="Source / Account" name="account_id" options={accountOptions(accounts)} required />
            <SelectField label="Type" name="type" defaultValue="expense" options={transactionFormTypeOptions} />
            <SelectField label="Destination (transfers)" name="destination_account_id" options={accountOptions(accounts)} />
            <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
            <SelectField label="Category" name="category_id" options={categoryOptions(categories)} />
            <TextField label="Merchant / Payee" name="merchant" />
            <TextField label="Transaction date" name="transaction_date" type="date" defaultValue={todayISO()} required />
            <TextField label="Posted date" name="posted_date" type="date" />
            <TextField label="Description" name="description" />
          </FormGrid>
          <div className="mt-4 grid gap-3">
            <TextareaField label="Notes" name="notes" />
            <CheckboxField label="Pending" name="pending" />
            <CheckboxField label="Exclude from spending totals" name="excluded_from_spending" />
          </div>
          <Button type="submit" className="mt-4">Add transaction</Button>
        </form>

        <form className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-[1fr_180px_220px_auto]" action="/money">
          <TextField label="Search" name="q" defaultValue={filters.q} placeholder="Merchant, description, notes" />
          <SelectField label="Type" name="type" defaultValue={filters.type ?? ""} options={transactionTypeOptions} />
          <SelectField label="Category" name="category" defaultValue={filters.category ?? ""} options={categoryOptions(categories, true)} />
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full">Filter</Button>
          </div>
        </form>

        {transactions.length ? (
          <div className="space-y-3">
            {transactions.map((transaction) => {
              const displayName = transaction.merchant_name || transaction.merchant || transaction.description || "Transaction";
              return (
                <details key={transaction.id} className="rounded-lg border bg-background p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{displayName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(transaction.transaction_date)} - {transaction.accounts?.name ?? "Account"}
                          {transaction.type === "transfer" ? ` to ${transaction.destination_accounts?.name ?? "destination"}` : ""} -{" "}
                          {transaction.budget_categories?.name ?? "Uncategorized"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={transaction.type === "income" ? "font-black text-primary" : "font-black"}>
                          {transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : ""}
                          {money(transaction.amount, true)}
                        </p>
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          <Badge variant="secondary">{transaction.type}</Badge>
                          {transaction.pending ? <Badge variant="muted">Pending</Badge> : null}
                          {transaction.source === "plaid" ? <Badge variant="muted">Plaid</Badge> : null}
                        </div>
                      </div>
                    </div>
                  </summary>
                  <form action={updateTransactionAction} className="mt-4 border-t pt-4">
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={transaction.id} />
                    <FormGrid>
                      <SelectField label="Source / Account" name="account_id" defaultValue={transaction.account_id} options={accountOptions(accounts)} required />
                      <SelectField label="Type" name="type" defaultValue={transaction.type} options={transactionFormTypeOptions} />
                      <SelectField
                        label="Destination (transfers)"
                        name="destination_account_id"
                        defaultValue={transaction.destination_account_id}
                        options={accountOptions(accounts)}
                      />
                      <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={transaction.amount} required />
                      <SelectField label="Category" name="category_id" defaultValue={transaction.category_id} options={categoryOptions(categories)} />
                      <TextField label="Merchant / Payee" name="merchant" defaultValue={transaction.merchant} />
                      <TextField label="Transaction date" name="transaction_date" type="date" defaultValue={transaction.transaction_date} required />
                      <TextField label="Posted date" name="posted_date" type="date" defaultValue={transaction.posted_date} />
                      <TextField label="Description" name="description" defaultValue={transaction.description} />
                    </FormGrid>
                    <div className="mt-4 grid gap-3">
                      <TextareaField label="Notes" name="notes" defaultValue={transaction.notes} />
                      <CheckboxField label="Pending" name="pending" defaultChecked={transaction.pending} />
                      <CheckboxField
                        label="Exclude from spending totals"
                        name="excluded_from_spending"
                        defaultChecked={transaction.excluded_from_spending}
                      />
                    </div>
                    <Button type="submit" className="mt-4">Save transaction</Button>
                  </form>
                  <form action={deleteTransactionAction} className="mt-2">
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={transaction.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No transactions found" description="Add a manual transaction or adjust the current filters." />
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetManager({
  categories,
  budgets,
  transactions,
}: {
  categories: BudgetCategory[];
  budgets: Budget[];
  transactions: Transaction[];
}) {
  const progress = getBudgetProgress(budgets, transactions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets and categories</CardTitle>
        <CardDescription>Budget amounts are month-specific so historical plans remain intact.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={createCategoryAction} className="rounded-lg border bg-background p-4">
            <HiddenRedirect to="/money" />
            <FormGrid>
              <TextField label="Category name" name="name" required />
              <TextField label="Group" name="group_name" placeholder="Food" required />
              <TextField label="Icon name" name="icon" placeholder="shopping-basket" />
            </FormGrid>
            <Button type="submit" className="mt-4">Add category</Button>
          </form>

          <form action={upsertBudgetAction} className="rounded-lg border bg-background p-4">
            <HiddenRedirect to="/money" />
            <FormGrid>
              <SelectField label="Category" name="category_id" options={categoryOptions(categories)} required />
              <TextField label="Month" name="month_start" type="date" defaultValue={monthStartISO()} required />
              <TextField label="Budget amount" name="amount" type="number" min="0" step="0.01" required />
            </FormGrid>
            <Button type="submit" className="mt-4">Save monthly budget</Button>
          </form>
        </div>

        {progress.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {progress.map((budget) => (
              <div key={budget.id} className="rounded-lg border bg-background p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{budget.budget_categories?.name ?? "Budget"}</p>
                    <p className="text-xs text-muted-foreground">{budget.budget_categories?.group_name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{money(budget.spent)} / {money(budget.amount)}</p>
                </div>
                <Progress value={budget.percent} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No monthly budgets" description="Set a budget for the current month to activate budget tracking." />
        )}

        {categories.length ? (
          <div className="space-y-2">
            {categories.map((category) => (
              <details key={category.id} className="rounded-md border bg-background p-3">
                <summary className="cursor-pointer list-none text-sm font-semibold">
                  {category.group_name} - {category.name} {category.archived ? <Badge variant="muted">Archived</Badge> : null}
                </summary>
                <form action={updateCategoryAction} className="mt-3 grid gap-3 sm:grid-cols-4">
                  <HiddenRedirect to="/money" />
                  <input type="hidden" name="id" value={category.id} />
                  <TextField label="Name" name="name" defaultValue={category.name} required />
                  <TextField label="Group" name="group_name" defaultValue={category.group_name} required />
                  <TextField label="Icon" name="icon" defaultValue={category.icon} />
                  <div className="grid gap-2">
                    <CheckboxField label="Archived" name="archived" defaultChecked={category.archived} />
                    <Button type="submit" size="sm">
                      <Archive className="size-4" />
                      Save
                    </Button>
                  </div>
                </form>
              </details>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BillsManager({
  accounts,
  categories,
  bills,
}: {
  accounts: Account[];
  categories: BudgetCategory[];
  bills: Bill[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          Bills
        </CardTitle>
        <CardDescription>Bills stay separate from transactions in V1 and also appear on the dashboard and calendar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createBillAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/money" />
          <FormGrid>
            <TextField label="Name" name="name" required />
            <TextField label="Amount" name="amount" type="number" min="0" step="0.01" required />
            <TextField label="Next due date" name="next_due_date" type="date" defaultValue={todayISO()} required />
            <SelectField label="Category" name="category_id" options={categoryOptions(categories)} />
            <SelectField label="Pay from" name="account_id" options={accountOptions(accounts)} />
            <CalendarRecurrenceFields recurrence="monthly" />
          </FormGrid>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <CheckboxField label="Recurring" name="recurring" defaultChecked />
            <CheckboxField label="Autopay" name="autopay" />
          </div>
          <TextareaField label="Notes" name="notes" className="mt-4" />
          <Button type="submit" className="mt-4">Add bill</Button>
        </form>

        {bills.length ? (
          <div className="space-y-3">
            {bills.map((bill) => (
              <details key={bill.id} className="rounded-lg border bg-background p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{bill.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(bill.next_due_date)} - {bill.budget_categories?.name ?? "Uncategorized"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{money(bill.amount, true)}</p>
                      <Badge variant={bill.active ? "secondary" : "muted"}>{bill.active ? "Active" : "Archived"}</Badge>
                    </div>
                  </div>
                </summary>
                <form action={updateBillAction} className="mt-4 border-t pt-4">
                  <HiddenRedirect to="/money" />
                  <input type="hidden" name="id" value={bill.id} />
                  <FormGrid>
                    <TextField label="Name" name="name" defaultValue={bill.name} required />
                    <TextField label="Amount" name="amount" type="number" min="0" step="0.01" defaultValue={bill.amount} required />
                    <TextField label="Next due date" name="next_due_date" type="date" defaultValue={bill.next_due_date} required />
                    <SelectField label="Category" name="category_id" defaultValue={bill.category_id} options={categoryOptions(categories)} />
                    <SelectField label="Pay from" name="account_id" defaultValue={bill.account_id} options={accountOptions(accounts)} />
                    <CalendarRecurrenceFields
                      recurrence={bill.recurrence}
                      interval={bill.recurrence_interval}
                      weekdays={bill.recurrence_days_of_week}
                      endDate={bill.recurrence_end_date}
                      count={bill.recurrence_count}
                    />
                  </FormGrid>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <CheckboxField label="Recurring" name="recurring" defaultChecked={bill.recurring} />
                    <CheckboxField label="Autopay" name="autopay" defaultChecked={bill.autopay} />
                    <CheckboxField label="Archived" name="inactive" defaultChecked={!bill.active} />
                  </div>
                  <TextareaField label="Notes" name="notes" defaultValue={bill.notes} className="mt-4" />
                  <Button type="submit" className="mt-4">Save bill</Button>
                </form>
                <div className="mt-2 flex gap-2">
                  <form action={markBillPaidAction}>
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={bill.id} />
                    <Button type="submit" variant="outline" size="sm">Mark paid</Button>
                  </form>
                  <form action={deleteBillAction}>
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={bill.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4" />
                      Archive
                    </Button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="No bills tracked" description="Add rent, utilities, insurance, and other due items." />
        )}
      </CardContent>
    </Card>
  );
}

export function SubscriptionsManager({
  accounts,
  categories,
  subscriptions,
}: {
  accounts: Account[];
  categories: BudgetCategory[];
  subscriptions: Subscription[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-primary" />
          Subscriptions
        </CardTitle>
        <CardDescription>Recurring services with monthly and annual equivalents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createSubscriptionAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/money" />
          <FormGrid>
            <TextField label="Name" name="name" required />
            <TextField label="Amount" name="amount" type="number" min="0" step="0.01" required />
            <SelectField label="Frequency" name="billing_frequency" defaultValue="monthly" options={billingFrequencyOptions} />
            <TextField label="Next billing date" name="next_billing_date" type="date" defaultValue={todayISO()} required />
            <SelectField label="Category" name="category_id" options={categoryOptions(categories)} />
            <SelectField label="Payment account" name="account_id" options={accountOptions(accounts)} />
          </FormGrid>
          <CheckboxField label="Active" name="active" defaultChecked />
          <Button type="submit" className="mt-4">Add subscription</Button>
        </form>

        {subscriptions.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {subscriptions.map((subscription) => {
              const normalized = normalizeSubscriptionCost(subscription);
              return (
                <details key={subscription.id} className="rounded-lg border bg-background p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{subscription.name}</p>
                        <p className="text-sm text-muted-foreground">Next {formatDate(subscription.next_billing_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black">{money(normalized.monthly, true)}/mo</p>
                        <p className="text-xs text-muted-foreground">{money(normalized.annual, true)}/yr</p>
                      </div>
                    </div>
                  </summary>
                  <form action={updateSubscriptionAction} className="mt-4 border-t pt-4">
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={subscription.id} />
                    <FormGrid>
                      <TextField label="Name" name="name" defaultValue={subscription.name} required />
                      <TextField label="Amount" name="amount" type="number" min="0" step="0.01" defaultValue={subscription.amount} required />
                      <SelectField label="Frequency" name="billing_frequency" defaultValue={subscription.billing_frequency} options={billingFrequencyOptions} />
                      <TextField label="Next billing date" name="next_billing_date" type="date" defaultValue={subscription.next_billing_date} required />
                      <SelectField label="Category" name="category_id" defaultValue={subscription.category_id} options={categoryOptions(categories)} />
                      <SelectField label="Payment account" name="account_id" defaultValue={subscription.account_id} options={accountOptions(accounts)} />
                    </FormGrid>
                    <div className="mt-4">
                      <CheckboxField label="Active" name="active" defaultChecked={subscription.active} />
                    </div>
                    <Button type="submit" className="mt-4">Save subscription</Button>
                  </form>
                  <form action={deleteSubscriptionAction} className="mt-2">
                    <HiddenRedirect to="/money" />
                    <input type="hidden" name="id" value={subscription.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No subscriptions" description="Track recurring services and see normalized monthly cost." />
        )}
      </CardContent>
    </Card>
  );
}
