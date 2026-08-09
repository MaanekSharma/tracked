"use server";

import { format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getNextRecurrenceDate } from "@/lib/calculations";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AccountType, BillingFrequency, Priority, Recurrence, TaskStatus } from "@/types/domain";

const accountTypes = [
  "chequing",
  "savings",
  "credit_card",
  "tfsa",
  "fhsa",
  "rrsp",
  "non_registered_investment",
  "cash",
  "other",
] as const satisfies readonly AccountType[];

const transactionTypes = ["income", "expense", "transfer"] as const;
const recurrences = ["none", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const satisfies readonly Recurrence[];
const billingFrequencies = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const satisfies readonly BillingFrequency[];
const priorities = ["low", "medium", "high", "urgent"] as const satisfies readonly Priority[];
const taskStatuses = ["open", "completed", "archived"] as const satisfies readonly TaskStatus[];
const goalStatuses = ["active", "completed", "archived"] as const;
const choreStatuses = ["active", "paused", "completed", "archived"] as const;

const idSchema = z.string().uuid();
const requiredText = z.string().trim().min(1, "Required");
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null));
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null));
const optionalNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.coerce.number().nullable(),
);

type Supabase = Awaited<ReturnType<typeof createClient>>;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function destination(formData: FormData, fallback: string) {
  const value = text(formData, "redirectTo");
  return value.startsWith("/") ? value : fallback;
}

function withParam(path: string, key: "notice" | "error", value: string) {
  const url = new URL(path, "http://tracked.local");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function pathOnly(path: string) {
  return new URL(path, "http://tracked.local").pathname;
}

async function requireMutationUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Please sign in again before saving changes.");
  }

  return { supabase, user };
}

async function assertNoError<T extends { error: { message: string } | null }>(result: T) {
  if (result.error) throw new Error(result.error.message);
}

async function mutate(
  formData: FormData,
  fallback: string,
  operation: (supabase: Supabase, userId: string) => Promise<void>,
  notice: "saved" | "updated" | "deleted" = "saved",
) {
  const target = destination(formData, fallback);
  let error: string | null = null;

  try {
    const { supabase, user } = await requireMutationUser();
    await operation(supabase, user.id);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to save changes.";
  }

  revalidatePath(pathOnly(target));
  if (error) redirect(withParam(target, "error", error));
  redirect(withParam(target, "notice", notice));
}

export async function signInAction(formData: FormData) {
  const supabase = await createClient();
  const email = text(formData, "email");
  const password = text(formData, "password");
  const next = text(formData, "next") || "/overview";

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(withParam("/login", "error", error.message));
  redirect(next.startsWith("/") ? next : "/overview");
}

export async function signUpAction(formData: FormData) {
  const supabase = await createClient();
  const email = text(formData, "email");
  const password = text(formData, "password");
  const displayName = text(formData, "display_name");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });

  if (error) redirect(withParam("/sign-up", "error", error.message));
  redirect("/overview");
}

export async function forgotPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const email = text(formData, "email");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl}/reset-password`,
  });

  if (error) redirect(withParam("/forgot-password", "error", error.message));
  redirect(withParam("/login", "notice", "saved"));
}

export async function resetPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const password = text(formData, "password");
  const { error } = await supabase.auth.updateUser({ password });

  if (error) redirect(withParam("/reset-password", "error", error.message));
  redirect(withParam("/overview", "notice", "updated"));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(withParam("/login", "notice", "signedout"));
}

const accountSchema = z.object({
  name: requiredText,
  type: z.enum(accountTypes),
  institution: optionalText,
  current_balance: z.coerce.number(),
  balance_as_of: requiredText,
  credit_limit: optionalNumber.refine((value) => value === null || value >= 0, "Credit limit must be nonnegative."),
  notes: optionalText,
  include_in_net_worth: z.boolean(),
  archived: z.boolean(),
});

export async function createAccountAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = accountSchema.parse({
      name: text(formData, "name"),
      type: text(formData, "type"),
      institution: text(formData, "institution"),
      current_balance: text(formData, "current_balance"),
      balance_as_of: text(formData, "balance_as_of") || format(new Date(), "yyyy-MM-dd"),
      credit_limit: text(formData, "credit_limit"),
      notes: text(formData, "notes"),
      include_in_net_worth: checked(formData, "include_in_net_worth"),
      archived: checked(formData, "archived"),
    });
    await assertNoError(await supabase.from("accounts").insert({ ...input, user_id: userId }));
  });
}

export async function updateAccountAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = accountSchema.parse({
        name: text(formData, "name"),
        type: text(formData, "type"),
        institution: text(formData, "institution"),
        current_balance: text(formData, "current_balance"),
        balance_as_of: text(formData, "balance_as_of") || format(new Date(), "yyyy-MM-dd"),
        credit_limit: text(formData, "credit_limit"),
        notes: text(formData, "notes"),
        include_in_net_worth: checked(formData, "include_in_net_worth"),
        archived: checked(formData, "archived"),
      });
      await assertNoError(await supabase.from("accounts").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function deleteAccountAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("accounts").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const categorySchema = z.object({
  name: requiredText,
  group_name: requiredText,
  icon: optionalText,
  archived: z.boolean(),
});

export async function createCategoryAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = categorySchema.parse({
      name: text(formData, "name"),
      group_name: text(formData, "group_name"),
      icon: text(formData, "icon"),
      archived: checked(formData, "archived"),
    });
    await assertNoError(await supabase.from("budget_categories").insert({ ...input, user_id: userId }));
  });
}

export async function updateCategoryAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = categorySchema.parse({
        name: text(formData, "name"),
        group_name: text(formData, "group_name"),
        icon: text(formData, "icon"),
        archived: checked(formData, "archived"),
      });
      await assertNoError(await supabase.from("budget_categories").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

const transactionSchema = z.object({
  account_id: idSchema,
  destination_account_id: optionalText,
  category_id: optionalText,
  type: z.enum(transactionTypes),
  amount: z.coerce.number().positive(),
  merchant: optionalText,
  description: optionalText,
  transaction_date: requiredText,
  posted_date: optionalDate,
  notes: optionalText,
  pending: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.type === "transfer") {
    if (!value.destination_account_id) {
      ctx.addIssue({ code: "custom", path: ["destination_account_id"], message: "Transfers require a destination account." });
    }
    if (value.destination_account_id === value.account_id) {
      ctx.addIssue({ code: "custom", path: ["destination_account_id"], message: "Transfer accounts must differ." });
    }
    if (value.category_id) {
      ctx.addIssue({ code: "custom", path: ["category_id"], message: "Transfers are not categorized for spending." });
    }
  }
});

export async function createTransactionAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = transactionSchema.parse({
      account_id: text(formData, "account_id"),
      destination_account_id: text(formData, "destination_account_id"),
      category_id: text(formData, "category_id"),
      type: text(formData, "type"),
      amount: text(formData, "amount"),
      merchant: text(formData, "merchant"),
      description: text(formData, "description"),
      transaction_date: text(formData, "transaction_date"),
      posted_date: text(formData, "posted_date"),
      notes: text(formData, "notes"),
      pending: checked(formData, "pending"),
    });
    const normalized = input.type === "transfer" ? { ...input, category_id: null } : { ...input, destination_account_id: null };
    await assertNoError(
      await supabase.from("transactions").insert({
        ...normalized,
        user_id: userId,
        source: "manual",
        category_source: normalized.category_id ? "manual" : null,
      }),
    );
  });
}

export async function updateTransactionAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = transactionSchema.parse({
        account_id: text(formData, "account_id"),
        destination_account_id: text(formData, "destination_account_id"),
        category_id: text(formData, "category_id"),
        type: text(formData, "type"),
        amount: text(formData, "amount"),
        merchant: text(formData, "merchant"),
        description: text(formData, "description"),
        transaction_date: text(formData, "transaction_date"),
        posted_date: text(formData, "posted_date"),
        notes: text(formData, "notes"),
        pending: checked(formData, "pending"),
      });
      const normalized = input.type === "transfer" ? { ...input, category_id: null } : { ...input, destination_account_id: null };
      await assertNoError(
        await supabase
          .from("transactions")
          .update({
            ...normalized,
            category_source: "manual",
          })
          .eq("id", id)
          .eq("user_id", userId),
      );
    },
    "updated",
  );
}

export async function deleteTransactionAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const budgetSchema = z.object({
  category_id: idSchema,
  month_start: requiredText,
  amount: z.coerce.number().nonnegative(),
});

export async function upsertBudgetAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = budgetSchema.parse({
      category_id: text(formData, "category_id"),
      month_start: text(formData, "month_start"),
      amount: text(formData, "amount"),
    });
    await assertNoError(
      await supabase.from("budgets").upsert({ ...input, user_id: userId }, { onConflict: "user_id,category_id,month_start" }),
    );
  });
}

const billSchema = z.object({
  name: requiredText,
  category_id: optionalText,
  account_id: optionalText,
  amount: z.coerce.number().nonnegative(),
  next_due_date: requiredText,
  recurring: z.boolean(),
  recurrence: z.enum(recurrences),
  autopay: z.boolean(),
  active: z.boolean(),
  notes: optionalText,
}).transform((value) => ({
  ...value,
  recurrence: value.recurring ? (value.recurrence === "none" ? "monthly" : value.recurrence) : "none",
}));

export async function createBillAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = billSchema.parse({
      name: text(formData, "name"),
      category_id: text(formData, "category_id"),
      account_id: text(formData, "account_id"),
      amount: text(formData, "amount"),
      next_due_date: text(formData, "next_due_date"),
      recurring: checked(formData, "recurring"),
      recurrence: text(formData, "recurrence") || "none",
      autopay: checked(formData, "autopay"),
      active: !checked(formData, "inactive"),
      notes: text(formData, "notes"),
    });
    await assertNoError(await supabase.from("bills").insert({ ...input, user_id: userId }));
  });
}

export async function updateBillAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = billSchema.parse({
        name: text(formData, "name"),
        category_id: text(formData, "category_id"),
        account_id: text(formData, "account_id"),
        amount: text(formData, "amount"),
        next_due_date: text(formData, "next_due_date"),
        recurring: checked(formData, "recurring"),
        recurrence: text(formData, "recurrence") || "none",
        autopay: checked(formData, "autopay"),
        active: !checked(formData, "inactive"),
        notes: text(formData, "notes"),
      });
      await assertNoError(await supabase.from("bills").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function markBillPaidAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const { data: bill, error } = await supabase
        .from("bills")
        .select("id, user_id, amount, next_due_date, recurring, recurrence, account_id")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !bill) throw new Error(error?.message ?? "Bill not found.");

      await assertNoError(
        await supabase.from("bill_payments").upsert(
          {
            user_id: userId,
            bill_id: id,
            due_date: bill.next_due_date,
            amount: bill.amount,
            paid_from_account_id: bill.account_id,
            paid_at: new Date().toISOString(),
          },
          { onConflict: "bill_id,due_date" },
        ),
      );

      const next = bill.recurring ? getNextRecurrenceDate(parseISO(bill.next_due_date), bill.recurrence) : null;
      await assertNoError(
        await supabase
          .from("bills")
          .update({
            next_due_date: next ? format(next, "yyyy-MM-dd") : bill.next_due_date,
            active: Boolean(next),
          })
          .eq("id", id)
          .eq("user_id", userId),
      );
    },
    "updated",
  );
}

export async function deleteBillAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("bills").update({ active: false }).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

const subscriptionSchema = z.object({
  name: requiredText,
  category_id: optionalText,
  account_id: optionalText,
  amount: z.coerce.number().nonnegative(),
  billing_frequency: z.enum(billingFrequencies),
  next_billing_date: requiredText,
  active: z.boolean(),
});

export async function createSubscriptionAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = subscriptionSchema.parse({
      name: text(formData, "name"),
      category_id: text(formData, "category_id"),
      account_id: text(formData, "account_id"),
      amount: text(formData, "amount"),
      billing_frequency: text(formData, "billing_frequency"),
      next_billing_date: text(formData, "next_billing_date"),
      active: checked(formData, "active"),
    });
    await assertNoError(await supabase.from("subscriptions").insert({ ...input, user_id: userId }));
  });
}

export async function updateSubscriptionAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = subscriptionSchema.parse({
        name: text(formData, "name"),
        category_id: text(formData, "category_id"),
        account_id: text(formData, "account_id"),
        amount: text(formData, "amount"),
        billing_frequency: text(formData, "billing_frequency"),
        next_billing_date: text(formData, "next_billing_date"),
        active: checked(formData, "active"),
      });
      await assertNoError(await supabase.from("subscriptions").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function deleteSubscriptionAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("subscriptions").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const taskSchema = z.object({
  title: requiredText,
  description: optionalText,
  status: z.enum(taskStatuses),
  priority: z.enum(priorities),
  due_date: optionalDate,
  due_time: optionalText,
  recurrence: z.enum(recurrences),
});

export async function createTaskAction(formData: FormData) {
  await mutate(formData, "/tasks", async (supabase, userId) => {
    const input = taskSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      status: text(formData, "status") || "open",
      priority: text(formData, "priority") || "medium",
      due_date: text(formData, "due_date"),
      due_time: text(formData, "due_time"),
      recurrence: text(formData, "recurrence") || "none",
    });
    await assertNoError(
      await supabase.from("tasks").insert({
        ...input,
        completed_at: input.status === "completed" ? new Date().toISOString() : null,
        user_id: userId,
      }),
    );
  });
}

export async function updateTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = taskSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        status: text(formData, "status") || "open",
        priority: text(formData, "priority") || "medium",
        due_date: text(formData, "due_date"),
        due_time: text(formData, "due_time"),
        recurrence: text(formData, "recurrence") || "none",
      });
      await assertNoError(
        await supabase
          .from("tasks")
          .update({
            ...input,
            completed_at: input.status === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", id)
          .eq("user_id", userId),
      );
    },
    "updated",
  );
}

export async function completeTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(
        await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId),
      );
    },
    "updated",
  );
}

export async function reopenTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function deleteTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const goalSchema = z.object({
  title: requiredText,
  description: optionalText,
  category: optionalText,
  target_value: z.coerce.number().positive(),
  initial_value: z.coerce.number().nonnegative(),
  unit: requiredText,
  start_date: optionalDate,
  target_date: optionalDate,
  status: z.enum(goalStatuses),
  color: optionalText,
  icon: optionalText,
});

export async function createGoalAction(formData: FormData) {
  await mutate(formData, "/goals", async (supabase, userId) => {
    const input = goalSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      category: text(formData, "category"),
      target_value: text(formData, "target_value"),
      initial_value: text(formData, "initial_value") || text(formData, "current_value") || "0",
      unit: text(formData, "unit") || "count",
      start_date: text(formData, "start_date"),
      target_date: text(formData, "target_date"),
      status: text(formData, "status") || "active",
      color: text(formData, "color"),
      icon: text(formData, "icon"),
    });
    await assertNoError(await supabase.from("goals").insert({ ...input, user_id: userId }));
  });
}

export async function updateGoalAction(formData: FormData) {
  await mutate(
    formData,
    "/goals",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = goalSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        category: text(formData, "category"),
        target_value: text(formData, "target_value"),
        initial_value: text(formData, "initial_value") || "0",
        unit: text(formData, "unit") || "count",
        start_date: text(formData, "start_date"),
        target_date: text(formData, "target_date"),
        status: text(formData, "status") || "active",
        color: text(formData, "color"),
        icon: text(formData, "icon"),
      });
      await assertNoError(await supabase.from("goals").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function addGoalUpdateAction(formData: FormData) {
  await mutate(
    formData,
    "/goals",
    async (supabase, userId) => {
      const goalId = idSchema.parse(text(formData, "goal_id"));
      const delta = z.coerce.number().parse(text(formData, "delta") || text(formData, "value"));
      const note = optionalText.parse(text(formData, "note"));
      const recordedAt = optionalDate.parse(text(formData, "recorded_at")) ?? format(new Date(), "yyyy-MM-dd");
      await assertNoError(
        await supabase.from("goal_updates").insert({ user_id: userId, goal_id: goalId, delta, note, recorded_at: recordedAt }),
      );
    },
    "updated",
  );
}

export async function deleteGoalAction(formData: FormData) {
  await mutate(
    formData,
    "/goals",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("goals").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const eventSchema = z.object({
  title: requiredText,
  description: optionalText,
  start_at: requiredText,
  end_at: optionalText,
  all_day: z.boolean(),
  location: optionalText,
  category: optionalText,
});

export async function createCalendarEventAction(formData: FormData) {
  await mutate(formData, "/calendar", async (supabase, userId) => {
    const input = eventSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      start_at: text(formData, "start_at"),
      end_at: text(formData, "end_at"),
      all_day: checked(formData, "all_day"),
      location: text(formData, "location"),
      category: text(formData, "category"),
    });
    await assertNoError(await supabase.from("calendar_events").insert({ ...input, user_id: userId }));
  });
}

export async function updateCalendarEventAction(formData: FormData) {
  await mutate(
    formData,
    "/calendar",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = eventSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        start_at: text(formData, "start_at"),
        end_at: text(formData, "end_at"),
        all_day: checked(formData, "all_day"),
        location: text(formData, "location"),
        category: text(formData, "category"),
      });
      await assertNoError(await supabase.from("calendar_events").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function deleteCalendarEventAction(formData: FormData) {
  await mutate(
    formData,
    "/calendar",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const choreSchema = z.object({
  title: requiredText,
  description: optionalText,
  frequency: z.enum(recurrences),
  next_due_date: optionalDate,
  last_completed_date: optionalDate,
  status: z.enum(choreStatuses),
  room: optionalText,
});

export async function createChoreAction(formData: FormData) {
  await mutate(formData, "/home", async (supabase, userId) => {
    const input = choreSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      frequency: text(formData, "frequency") || "weekly",
      next_due_date: text(formData, "next_due_date"),
      last_completed_date: text(formData, "last_completed_date"),
      status: text(formData, "status") || "active",
      room: text(formData, "room"),
    });
    await assertNoError(await supabase.from("chores").insert({ ...input, user_id: userId }));
  });
}

export async function updateChoreAction(formData: FormData) {
  await mutate(
    formData,
    "/home",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = choreSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        frequency: text(formData, "frequency") || "weekly",
        next_due_date: text(formData, "next_due_date"),
        last_completed_date: text(formData, "last_completed_date"),
        status: text(formData, "status") || "active",
        room: text(formData, "room"),
      });
      await assertNoError(await supabase.from("chores").update(input).eq("id", id).eq("user_id", userId));
    },
    "updated",
  );
}

export async function completeChoreAction(formData: FormData) {
  await mutate(
    formData,
    "/home",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const frequency = z.enum(recurrences).parse(text(formData, "frequency") || "none");
      const completed = new Date();
      const next = getNextRecurrenceDate(completed, frequency);
      await assertNoError(
        await supabase.from("chore_completions").insert({
          user_id: userId,
          chore_id: id,
          completed_on: format(completed, "yyyy-MM-dd"),
        }),
      );
      await assertNoError(
        await supabase
          .from("chores")
          .update({
            last_completed_date: format(completed, "yyyy-MM-dd"),
            next_due_date: next ? format(next, "yyyy-MM-dd") : null,
            status: next ? "active" : "completed",
          })
          .eq("id", id)
          .eq("user_id", userId),
      );
    },
    "updated",
  );
}

export async function deleteChoreAction(formData: FormData) {
  await mutate(
    formData,
    "/home",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(await supabase.from("chores").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

export async function updateProfileAction(formData: FormData) {
  await mutate(
    formData,
    "/settings",
    async (supabase, userId) => {
      const input = z
        .object({
          display_name: optionalText,
          preferred_currency: z.literal("CAD"),
          timezone: requiredText,
          theme: z.enum(["dark", "light", "system"]),
          savings_rate_target: optionalNumber.refine((value) => value === null || (value >= 0 && value <= 100), "Target must be 0 to 100."),
        })
        .parse({
          display_name: text(formData, "display_name"),
          preferred_currency: text(formData, "preferred_currency") || "CAD",
          timezone: text(formData, "timezone") || "America/Toronto",
          theme: text(formData, "theme") || "dark",
          savings_rate_target: text(formData, "savings_rate_target"),
        });

      await assertNoError(await supabase.from("profiles").update(input).eq("id", userId));
    },
    "updated",
  );
}

export async function ensureProfileAction() {
  const { supabase, user } = await requireMutationUser();
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  await assertNoError(
    await supabase.from("profiles").insert({
      id: user.id,
      display_name: user.user_metadata?.display_name ?? null,
      preferred_currency: "CAD",
      timezone: "America/Toronto",
      theme: "dark",
    }),
  );
}

export async function seedDefaultCategoriesAction() {
  await mutate(
    new FormData(),
    "/settings",
    async (supabase) => {
      await assertNoError(await supabase.rpc("seed_default_budget_categories"));
    },
    "updated",
  );
}
