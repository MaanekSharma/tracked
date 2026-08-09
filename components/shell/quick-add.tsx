"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarPlus, CheckSquare, CreditCard, Goal, Home, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckboxField, FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";
import { CalendarRecurrenceFields } from "@/features/calendar/calendar-form-fields";
import {
  createBillAction,
  createCalendarEventAction,
  createChoreAction,
  createGoalAction,
  createTaskAction,
  createTransactionAction,
} from "@/features/actions";
import { accountTypeLabels, type Account, type BudgetCategory } from "@/types/domain";
import { monthStartISO, todayISO } from "@/lib/utils";

const transactionTypeOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

type QuickAddType = "transaction" | "task" | "bill" | "goal" | "event" | "chore";

const quickAddItems: { type: QuickAddType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "transaction", label: "Transaction", icon: ReceiptText },
  { type: "task", label: "Task", icon: CheckSquare },
  { type: "bill", label: "Bill", icon: CreditCard },
  { type: "goal", label: "Goal", icon: Goal },
  { type: "event", label: "Event", icon: CalendarPlus },
  { type: "chore", label: "Chore", icon: Home },
];

export function QuickAdd({ accounts, categories }: { accounts: Account[]; categories: BudgetCategory[] }) {
  const pathname = usePathname();
  const [type, setType] = useState<QuickAddType>("transaction");
  const accountOptions = useMemo(
    () => [
      { value: "", label: accounts.length ? "Select account" : "Create an account first" },
      ...accounts.map((account) => ({ value: account.id, label: `${account.name} - ${accountTypeLabels[account.type]}` })),
    ],
    [accounts],
  );
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Uncategorized" },
      ...categories.map((category) => ({ value: category.id, label: `${category.group_name} - ${category.name}` })),
    ],
    [categories],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full justify-center">
          <Plus className="size-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick add</DialogTitle>
          <DialogDescription>Create the next item without leaving your current view.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {quickAddItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => setType(item.type)}
                className={`flex h-20 flex-col items-center justify-center gap-2 rounded-md border text-xs font-semibold transition-colors ${
                  type === item.type ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {type === "transaction" && (
          <form action={createTransactionAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <SelectField label="Source / Account" name="account_id" options={accountOptions} required />
              <SelectField label="Type" name="type" defaultValue="expense" options={transactionTypeOptions} />
              <SelectField label="Destination (transfers)" name="destination_account_id" options={accountOptions} />
              <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
              <SelectField label="Category" name="category_id" options={categoryOptions} />
              <TextField label="Merchant / Payee" name="merchant" />
              <TextField label="Date" name="transaction_date" type="date" defaultValue={todayISO()} required />
            </FormGrid>
            <TextareaField label="Notes" name="notes" />
            <CheckboxField label="Pending" name="pending" />
            <Button type="submit">Save transaction</Button>
          </form>
        )}

        {type === "task" && (
          <form action={createTaskAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <TextField label="Title" name="title" required />
              <SelectField label="Priority" name="priority" defaultValue="medium" options={priorityOptions} />
              <TextField label="Due date" name="due_date" type="date" />
              <TextField label="Due time" name="due_time" type="time" />
              <CalendarRecurrenceFields />
              <input type="hidden" name="status" value="open" />
            </FormGrid>
            <TextareaField label="Description" name="description" />
            <Button type="submit">Save task</Button>
          </form>
        )}

        {type === "bill" && (
          <form action={createBillAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <TextField label="Name" name="name" required />
              <TextField label="Amount" name="amount" type="number" min="0" step="0.01" required />
              <TextField label="Next due date" name="next_due_date" type="date" defaultValue={todayISO()} required />
              <SelectField label="Category" name="category_id" options={categoryOptions} />
              <SelectField label="Pay from" name="account_id" options={accountOptions} />
              <CalendarRecurrenceFields recurrence="monthly" />
            </FormGrid>
            <div className="grid gap-2 sm:grid-cols-3">
              <CheckboxField label="Recurring" name="recurring" defaultChecked />
              <CheckboxField label="Autopay" name="autopay" />
            </div>
            <TextareaField label="Notes" name="notes" />
            <Button type="submit">Save bill</Button>
          </form>
        )}

        {type === "goal" && (
          <form action={createGoalAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <TextField label="Title" name="title" required />
              <TextField label="Category" name="category" />
              <TextField label="Target value" name="target_value" type="number" min="0.01" step="0.01" required />
              <TextField label="Initial value" name="initial_value" type="number" min="0" step="0.01" defaultValue={0} />
              <TextField label="Unit" name="unit" defaultValue="count" required />
              <TextField label="Target date" name="target_date" type="date" />
              <input type="hidden" name="start_date" value={monthStartISO()} />
              <input type="hidden" name="status" value="active" />
            </FormGrid>
            <TextareaField label="Description" name="description" />
            <Button type="submit">Save goal</Button>
          </form>
        )}

        {type === "event" && (
          <form action={createCalendarEventAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <TextField label="Title" name="title" required />
              <TextField label="Start" name="start_at" type="datetime-local" required />
              <TextField label="End" name="end_at" type="datetime-local" />
              <TextField label="Location" name="location" />
              <TextField label="Category" name="category" />
              <CalendarRecurrenceFields />
            </FormGrid>
            <CheckboxField label="All day" name="all_day" />
            <TextareaField label="Description" name="description" />
            <Button type="submit">Save event</Button>
          </form>
        )}

        {type === "chore" && (
          <form action={createChoreAction} className="space-y-4">
            <HiddenRedirect to={pathname} />
            <FormGrid>
              <TextField label="Title" name="title" required />
              <TextField label="Room / Category" name="room" />
              <CalendarRecurrenceFields name="frequency" label="Frequency" recurrence="weekly" />
              <TextField label="Next due" name="next_due_date" type="date" defaultValue={todayISO()} />
              <input type="hidden" name="status" value="active" />
            </FormGrid>
            <TextareaField label="Description" name="description" />
            <Button type="submit">Save chore</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
