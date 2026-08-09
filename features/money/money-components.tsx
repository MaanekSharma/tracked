import {
  Archive,
  CreditCard,
  PiggyBank,
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
  updateAccountAction,
  updateBillAction,
  updateCategoryAction,
  updateSubscriptionAction,
  updateTransactionAction,
  upsertBudgetAction,
} from "@/features/actions";
import { PlaidAccountActions, PlaidConnectButton } from "@/features/plaid/plaid-components";
import { getBudgetProgress, normalizeSubscriptionCost } from "@/lib/calculations";
import { formatDate, money, monthStartISO, todayISO } from "@/lib/utils";
import {
  accountTypeLabels,
  billingFrequencyLabels,
  recurrenceLabels,
  type Account,
  type Bill,
  type Budget,
  type BudgetCategory,
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
const recurrenceOptions = Object.entries(recurrenceLabels).map(([value, label]) => ({ value, label }));
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
      return "Needs refresh";
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

export function AccountManager({ accounts, plaidItems }: { accounts: Account[]; plaidItems: PlaidItem[] }) {
  const plaidItemById = new Map(plaidItems.map((item) => [item.id, item]));

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
        <PlaidConnectButton />
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createAccountAction} className="rounded-lg border bg-background p-4">
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

        {accounts.length ? (
          <div className="space-y-3">
            {accounts.map((account) => {
              const plaidItem = account.plaid_item_uuid ? plaidItemById.get(account.plaid_item_uuid) : null;
              const plaidStatus = plaidItem?.status ?? account.plaid_connection_status;
              const institutionName = account.institution_name ?? account.institution ?? plaidItem?.institution_name;
              return (
                <details key={account.id} className="rounded-lg border bg-background p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{account.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {accountTypeLabels[account.type]}{institutionName ? ` - ${institutionName}` : ""}
                          {account.mask ? ` - ****${account.mask}` : ""} - As of {formatDate(account.balance_as_of)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black">{money(account.current_balance)}</p>
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          {account.plaid_account_id ? (
                            <Badge variant={plaidStatusVariant(plaidStatus)}>Plaid {plaidStatusLabel(plaidStatus)}</Badge>
                          ) : null}
                          {account.archived ? <Badge variant="muted">Archived</Badge> : null}
                        </div>
                      </div>
                    </div>
                  </summary>
                  {account.plaid_account_id ? (
                    <div className="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
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
                      <PlaidAccountActions plaidItemId={account.plaid_item_uuid} institutionName={institutionName} />
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
            <SelectField label="Recurrence" name="recurrence" defaultValue="monthly" options={recurrenceOptions} />
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
                    <SelectField label="Recurrence" name="recurrence" defaultValue={bill.recurrence} options={recurrenceOptions} />
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
