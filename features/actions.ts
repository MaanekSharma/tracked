"use server";

import { format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { calendarDateKey, dateTimeLocalToIso, DEFAULT_CALENDAR_TIME_ZONE, normalizeRecurrenceAlias } from "@/lib/calendar-recurrence";
import { getNextRecurrenceDate } from "@/lib/calculations";
import { env } from "@/lib/env";
import { hasFutureRecurrence } from "@/lib/recurrence-progress";
import { requestLifeRpgReconciliation } from "@/lib/life-rpg/reconcile";
import { RPG_CATEGORIES, RPG_DIFFICULTIES } from "@/lib/life-rpg";
import { createClient } from "@/lib/supabase/server";
import type { AccountType, BillingFrequency, Priority, Recurrence, TaskStatus, TransactionType } from "@/types/domain";

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
const recurrences = ["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const satisfies readonly Recurrence[];
const recurrenceInputs = [
  ...recurrences,
  "every_2_weeks",
  "annually",
] as const;
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
const recurrenceCount = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.coerce.number().int().min(1).nullable(),
);
const recurrenceMetadataSchema = {
  recurrence_interval: z.coerce.number().int().min(1),
  recurrence_days_of_week: z
    .array(z.coerce.number().int().min(0).max(6))
    .transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  recurrence_end_date: optionalDate,
  recurrence_count: recurrenceCount,
};
const recurrenceSchema = z.object({
  recurrence: z.enum(recurrenceInputs),
  ...recurrenceMetadataSchema,
});
const frequencySchema = z.object({
  frequency: z.enum(recurrenceInputs),
  ...recurrenceMetadataSchema,
});

type Supabase = Awaited<ReturnType<typeof createClient>>;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function requiredFormText(formData: FormData, key: string) {
  const value = text(formData, key).trim();
  if (!value) throw new Error(`Missing required form field: ${key}.`);
  return value;
}

function texts(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function recurrenceFormFields(formData: FormData, recurrenceKey: "recurrence" | "frequency" = "recurrence") {
  return {
    [recurrenceKey]: requiredFormText(formData, recurrenceKey),
    recurrence_interval: requiredFormText(formData, "recurrence_interval"),
    recurrence_days_of_week: texts(formData, "recurrence_days_of_week"),
    recurrence_end_date: text(formData, "recurrence_end_date"),
    recurrence_count: text(formData, "recurrence_count"),
  };
}

function normalizeRecurrenceFields(
  input: z.infer<typeof recurrenceSchema>,
  startsOn: string | null | undefined,
  label: string,
) {
  if (input.recurrence !== "none" && !startsOn) {
    throw new Error(`Recurring ${label}s require a calendar date.`);
  }

  if (input.recurrence_end_date && startsOn && input.recurrence_end_date < startsOn) {
    throw new Error(`Recurrence end date must be on or after the ${label} start date.`);
  }

  const normalized = normalizeRecurrenceAlias(input.recurrence, input.recurrence_interval);
  const recurring = normalized.recurrence !== "none";
  const weekly = normalized.recurrence === "weekly";

  return {
    recurrence: normalized.recurrence,
    recurrence_interval: recurring ? normalized.recurrenceInterval : 1,
    recurrence_days_of_week: recurring && weekly && input.recurrence_days_of_week.length ? input.recurrence_days_of_week : null,
    recurrence_end_date: recurring ? input.recurrence_end_date : null,
    recurrence_count: recurring ? input.recurrence_count : null,
  };
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

async function getUserTimeZone(supabase: Supabase, userId: string) {
  const { data } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  return data?.timezone ?? DEFAULT_CALENDAR_TIME_ZONE;
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
    const scope = fallback === "/tasks" ? "task"
      : fallback === "/calendar" ? "calendar"
      : fallback === "/goals" ? "goal"
      : fallback === "/home" ? "home"
      : fallback === "/money" ? "wealth"
      : "full";
    await requestLifeRpgReconciliation(supabase, [scope]);
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
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id, plaid_item_uuid")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (accountError) throw new Error("Unable to verify this account before deletion.");
      if (!account) throw new Error("Account not found or you do not have permission to delete it.");

      if (account.plaid_item_uuid) {
        const { data: plaidItem, error: plaidItemError } = await supabase
          .from("plaid_items")
          .select("status")
          .eq("id", account.plaid_item_uuid)
          .eq("user_id", userId)
          .maybeSingle();

        if (plaidItemError) throw new Error("Unable to verify this account's Plaid connection.");
        if (!plaidItem || plaidItem.status !== "disconnected") {
          throw new Error("Disconnect this bank connection before permanently deleting its accounts.");
        }
      }

      const { data: deletedAccount, error: deleteError } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (deleteError) throw new Error("Unable to permanently delete this account.");
      if (!deletedAccount) throw new Error("Account not found or you do not have permission to delete it.");

      revalidatePath("/(app)", "layout");
    },
    "deleted",
  );
}

export async function linkPlaidAccountAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase) => {
      const sourceAccountId = idSchema.parse(text(formData, "source_plaid_account_id"));
      const targetAccountId = idSchema.parse(text(formData, "target_manual_account_id"));
      await assertNoError(await supabase.rpc("link_manual_account_to_plaid", {
        source_plaid_account_uuid: sourceAccountId,
        target_manual_account_uuid: targetAccountId,
      }));
    },
    "updated",
  );
}

export async function keepPlaidAccountSeparateAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await assertNoError(
        await supabase
          .from("accounts")
          .update({ reconciliation_status: "not_needed", include_in_net_worth: true })
          .eq("id", id)
          .eq("user_id", userId)
          .not("plaid_account_id", "is", null),
      );
    },
    "updated",
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
  excluded_from_spending: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.type === "transfer") {
    if (!value.destination_account_id) {
      ctx.addIssue({ code: "custom", path: ["destination_account_id"], message: "Transfers require a destination account." });
    }
    if (value.destination_account_id === value.account_id) {
      ctx.addIssue({ code: "custom", path: ["destination_account_id"], message: "Transfer accounts must differ." });
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
      excluded_from_spending: checked(formData, "excluded_from_spending"),
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
        excluded_from_spending: checked(formData, "excluded_from_spending"),
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

const transactionMetadataSchema = z.object({
  category_id: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().uuid().nullable(),
  ),
  classification: z.enum(["automatic", ...transactionTypes]),
  excluded_from_spending: z.boolean(),
  notes: optionalText,
});

export async function updateTransactionMetadataAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = transactionMetadataSchema.parse({
        category_id: text(formData, "category_id"),
        classification: text(formData, "classification"),
        excluded_from_spending: checked(formData, "excluded_from_spending"),
        notes: text(formData, "notes"),
      });
      const { data: transaction, error } = await supabase
        .from("transactions")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error("Unable to load this transaction before saving.");
      if (!transaction) throw new Error("Transaction not found or you do not have permission to edit it.");

      const selectedType = input.classification === "automatic"
        ? null
        : input.classification as TransactionType;

      await assertNoError(
        await supabase
          .from("transactions")
          .update({
            type_override: selectedType,
            category_id: input.category_id,
            category_source: "manual",
            excluded_from_spending: input.excluded_from_spending,
            notes: input.notes,
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
  autopay: z.boolean(),
  active: z.boolean(),
  notes: optionalText,
}).merge(recurrenceSchema);

function normalizeBillInput(input: z.infer<typeof billSchema>) {
  if (!input.recurring) {
    return {
      ...input,
      recurring: false,
      recurrence: "none" as const,
      recurrence_interval: 1,
      recurrence_days_of_week: null,
      recurrence_end_date: null,
      recurrence_count: null,
    };
  }

  const recurrence = normalizeRecurrenceFields(input, input.next_due_date, "bill");
  if (recurrence.recurrence === "none") {
    throw new Error("Recurring bills require a recurrence other than one-time.");
  }

  return {
    ...input,
    recurring: true,
    ...recurrence,
  };
}

export async function createBillAction(formData: FormData) {
  await mutate(formData, "/money", async (supabase, userId) => {
    const input = normalizeBillInput(billSchema.parse({
      name: text(formData, "name"),
      category_id: text(formData, "category_id"),
      account_id: text(formData, "account_id"),
      amount: text(formData, "amount"),
      next_due_date: text(formData, "next_due_date"),
      recurring: checked(formData, "recurring"),
      autopay: checked(formData, "autopay"),
      active: !checked(formData, "inactive"),
      notes: text(formData, "notes"),
      ...recurrenceFormFields(formData),
    }));
    await assertNoError(await supabase.from("bills").insert({ ...input, user_id: userId }));
  });
}

export async function updateBillAction(formData: FormData) {
  await mutate(
    formData,
    "/money",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = normalizeBillInput(billSchema.parse({
        name: text(formData, "name"),
        category_id: text(formData, "category_id"),
        account_id: text(formData, "account_id"),
        amount: text(formData, "amount"),
        next_due_date: text(formData, "next_due_date"),
        recurring: checked(formData, "recurring"),
        autopay: checked(formData, "autopay"),
        active: !checked(formData, "inactive"),
        notes: text(formData, "notes"),
        ...recurrenceFormFields(formData),
      }));
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
        .select("id, user_id, amount, next_due_date, recurring, recurrence, recurrence_interval, recurrence_end_date, recurrence_count, account_id")
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

      const { count: paidCount } = await supabase
        .from("bill_payments")
        .select("id", { count: "exact", head: true })
        .eq("bill_id", id)
        .eq("user_id", userId);
      const next = bill.recurring ? getNextRecurrenceDate(parseISO(bill.next_due_date), bill.recurrence, bill.recurrence_interval) : null;
      const nextDate = next ? format(next, "yyyy-MM-dd") : null;
      const active = hasFutureRecurrence({
        nextDate,
        completedCount: paidCount ?? 0,
        recurrenceCount: bill.recurrence_count,
        recurrenceEndDate: bill.recurrence_end_date,
      });
      await assertNoError(
        await supabase
          .from("bills")
          .update({
            next_due_date: active && nextDate ? nextDate : bill.next_due_date,
            active,
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
  rpg_category: z.preprocess((value) => value === "" ? null : value, z.enum(RPG_CATEGORIES).nullable()),
  rpg_difficulty: z.enum(RPG_DIFFICULTIES),
}).merge(recurrenceSchema);

function normalizeTaskInput(input: z.infer<typeof taskSchema>) {
  return {
    ...input,
    ...normalizeRecurrenceFields(input, input.due_date, "task"),
  };
}

export async function createTaskAction(formData: FormData) {
  await mutate(formData, "/tasks", async (supabase, userId) => {
    const input = normalizeTaskInput(taskSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      status: text(formData, "status") || "open",
      priority: text(formData, "priority") || "medium",
      due_date: text(formData, "due_date"),
      due_time: text(formData, "due_time"),
      rpg_category: text(formData, "rpg_category"),
      rpg_difficulty: text(formData, "rpg_difficulty") || "medium",
      ...recurrenceFormFields(formData),
    }));
    const requestedStatus = input.status;
    const { data: task, error } = await supabase.from("tasks").insert({
        ...input,
        status: requestedStatus === "completed" ? "open" : requestedStatus,
        completed_at: null,
        user_id: userId,
      }).select("id").single();
    if (error || !task) throw new Error(error?.message ?? "Unable to create task.");
    if (requestedStatus === "completed") {
      await requestLifeRpgReconciliation(supabase, ["full"]);
      await assertNoError(await supabase.rpc("complete_task_occurrence", { target_task_id: task.id }));
    }
  });
}

export async function updateTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = normalizeTaskInput(taskSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        status: text(formData, "status") || "open",
        priority: text(formData, "priority") || "medium",
        due_date: text(formData, "due_date"),
        due_time: text(formData, "due_time"),
        rpg_category: text(formData, "rpg_category"),
        rpg_difficulty: text(formData, "rpg_difficulty") || "medium",
        ...recurrenceFormFields(formData),
      }));
      const requestedStatus = input.status;
      await assertNoError(
        await supabase
          .from("tasks")
          .update({
            ...input,
            status: requestedStatus === "completed" ? "open" : requestedStatus,
            completed_at: null,
          })
          .eq("id", id)
          .eq("user_id", userId),
      );
      if (requestedStatus === "completed") {
        await requestLifeRpgReconciliation(supabase, ["full"]);
        await assertNoError(await supabase.rpc("complete_task_occurrence", { target_task_id: id }));
      }
    },
    "updated",
  );
}

export async function completeTaskAction(formData: FormData) {
  await mutate(
    formData,
    "/tasks",
    async (supabase) => {
      const id = idSchema.parse(text(formData, "id"));
      await requestLifeRpgReconciliation(supabase, ["full"]);
      await assertNoError(await supabase.rpc("complete_task_occurrence", { target_task_id: id }));
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
}).merge(recurrenceSchema);

function normalizeCalendarEventInput(input: z.infer<typeof eventSchema>, timeZone: string) {
  const start_at = dateTimeLocalToIso(input.start_at, timeZone);
  const end_at = input.end_at ? dateTimeLocalToIso(input.end_at, timeZone) : null;

  if (end_at && new Date(end_at) < new Date(start_at)) {
    throw new Error("Event end must be after the start.");
  }

  const startsOn = calendarDateKey(start_at, timeZone);
  const recurrence = normalizeRecurrenceFields(input, startsOn, "event");

  return {
    ...input,
    start_at,
    end_at,
    ...recurrence,
  };
}

export async function createCalendarEventAction(formData: FormData) {
  await mutate(formData, "/calendar", async (supabase, userId) => {
    const timeZone = await getUserTimeZone(supabase, userId);
    const input = normalizeCalendarEventInput(eventSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      start_at: text(formData, "start_at"),
      end_at: text(formData, "end_at"),
      all_day: checked(formData, "all_day"),
      location: text(formData, "location"),
      category: text(formData, "category"),
      ...recurrenceFormFields(formData),
    }), timeZone);
    await assertNoError(await supabase.from("calendar_events").insert({ ...input, timezone: timeZone, user_id: userId }));
  });
}

export async function updateCalendarEventAction(formData: FormData) {
  await mutate(
    formData,
    "/calendar",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      await requestLifeRpgReconciliation(supabase, ["calendar"]);
      const timeZone = await getUserTimeZone(supabase, userId);
      const input = normalizeCalendarEventInput(eventSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        start_at: text(formData, "start_at"),
        end_at: text(formData, "end_at"),
        all_day: checked(formData, "all_day"),
        location: text(formData, "location"),
        category: text(formData, "category"),
        ...recurrenceFormFields(formData),
      }), timeZone);
      await assertNoError(await supabase.from("calendar_events").update({ ...input, timezone: timeZone }).eq("id", id).eq("user_id", userId));
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
      await requestLifeRpgReconciliation(supabase, ["calendar"]);
      await assertNoError(await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", userId));
    },
    "deleted",
  );
}

const choreSchema = z.object({
  title: requiredText,
  description: optionalText,
  next_due_date: optionalDate,
  last_completed_date: optionalDate,
  status: z.enum(choreStatuses),
  room: optionalText,
}).merge(frequencySchema);

function normalizeChoreInput(input: z.infer<typeof choreSchema>) {
  const recurrence = normalizeRecurrenceFields({ ...input, recurrence: input.frequency }, input.next_due_date, "chore");
  return {
    ...input,
    frequency: recurrence.recurrence,
    recurrence_interval: recurrence.recurrence_interval,
    recurrence_days_of_week: recurrence.recurrence_days_of_week,
    recurrence_end_date: recurrence.recurrence_end_date,
    recurrence_count: recurrence.recurrence_count,
  };
}

export async function createChoreAction(formData: FormData) {
  await mutate(formData, "/home", async (supabase, userId) => {
    const input = normalizeChoreInput(choreSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      next_due_date: text(formData, "next_due_date"),
      last_completed_date: text(formData, "last_completed_date"),
      status: text(formData, "status") || "active",
      room: text(formData, "room"),
      ...recurrenceFormFields(formData, "frequency"),
    }));
    await assertNoError(await supabase.from("chores").insert({ ...input, user_id: userId }));
  });
}

export async function updateChoreAction(formData: FormData) {
  await mutate(
    formData,
    "/home",
    async (supabase, userId) => {
      const id = idSchema.parse(text(formData, "id"));
      const input = normalizeChoreInput(choreSchema.parse({
        title: text(formData, "title"),
        description: text(formData, "description"),
        next_due_date: text(formData, "next_due_date"),
        last_completed_date: text(formData, "last_completed_date"),
        status: text(formData, "status") || "active",
        room: text(formData, "room"),
        ...recurrenceFormFields(formData, "frequency"),
      }));
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
      const { data: chore, error } = await supabase
        .from("chores")
        .select("id, frequency, recurrence_interval, recurrence_end_date, recurrence_count")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !chore) throw new Error(error?.message ?? "Chore not found.");

      const completed = new Date();
      await assertNoError(
        await supabase.from("chore_completions").insert({
          user_id: userId,
          chore_id: id,
          completed_on: format(completed, "yyyy-MM-dd"),
        }),
      );
      const { count: completionCount } = await supabase
        .from("chore_completions")
        .select("id", { count: "exact", head: true })
        .eq("chore_id", id)
        .eq("user_id", userId);
      const next = getNextRecurrenceDate(completed, chore.frequency, chore.recurrence_interval);
      const nextDate = next ? format(next, "yyyy-MM-dd") : null;
      const active = hasFutureRecurrence({
        nextDate,
        completedCount: completionCount ?? 0,
        recurrenceCount: chore.recurrence_count,
        recurrenceEndDate: chore.recurrence_end_date,
      });
      await assertNoError(
        await supabase
          .from("chores")
          .update({
            last_completed_date: format(completed, "yyyy-MM-dd"),
            next_due_date: active && nextDate ? nextDate : null,
            status: active ? "active" : "completed",
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
          timezone: text(formData, "timezone") || DEFAULT_CALENDAR_TIME_ZONE,
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
      timezone: DEFAULT_CALENDAR_TIME_ZONE,
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
