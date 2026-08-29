"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildCalendarEventWrite,
  planCalendarEventResize,
  planCalendarItemMove,
  type CalendarEventEditorInput,
  type CalendarMutationData,
  type CalendarMutationResult,
  type CreateInteractiveCalendarEventInput,
  type DeleteInteractiveCalendarEventInput,
  type MoveCalendarItemInput,
  type ResizeCalendarEventInput,
  type UpdateInteractiveCalendarEventInput,
} from "@/lib/calendar-interactions";
import { DEFAULT_CALENDAR_TIME_ZONE, normalizeRecurrenceAlias } from "@/lib/calendar-recurrence";
import { requestLifeRpgReconciliation, type RpgReconciliationScope } from "@/lib/life-rpg/reconcile";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const recurrenceScopeSchema = z.enum(["occurrence", "future", "series"]);
const recurrenceSchema = z.enum([
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "every_2_weeks",
  "annually",
]);
const nullableString = z.string().nullable().optional();
const eventEditorSchema = z.object({
  title: z.string(),
  startDate: z.string(),
  endDate: nullableString,
  startTime: nullableString,
  endTime: nullableString,
  allDay: z.boolean(),
  category: nullableString,
  location: nullableString,
  description: nullableString,
  recurrence: recurrenceSchema.optional(),
  recurrenceInterval: z.number().int().min(1).optional(),
  recurrenceDaysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  recurrenceEndDate: nullableString,
  recurrenceCount: z.number().int().min(1).nullable().optional(),
});
const updateEventSchema = eventEditorSchema.extend({
  sourceId: idSchema,
  scope: recurrenceScopeSchema.optional(),
});
const deleteEventSchema = z.object({
  sourceId: idSchema,
  scope: recurrenceScopeSchema.optional(),
});
const moveSchema = z.object({
  sourceId: idSchema,
  sourceType: z.enum(["event", "task", "bill", "chore"]),
  originalStartStr: z.string().min(1),
  originalOccurrenceDate: z.string().optional(),
  startStr: z.string().min(1),
  endStr: z.string().nullable().optional(),
  allDay: z.boolean(),
  scope: recurrenceScopeSchema.optional(),
});
const resizeSchema = z.object({
  sourceId: idSchema,
  startStr: z.string().min(1),
  endStr: z.string().min(1),
  scope: recurrenceScopeSchema.optional(),
});

type Supabase = Awaited<ReturnType<typeof createClient>>;

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Calendar input is invalid.";
  return error instanceof Error ? error.message : "Unable to update the calendar.";
}

async function runAction<T>(operation: () => Promise<T>): Promise<CalendarMutationResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function requireMutationUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please sign in again before saving calendar changes.");
  return { supabase, userId: user.id };
}

async function getUserTimeZone(supabase: Supabase, userId: string) {
  const { data, error } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.timezone || DEFAULT_CALENDAR_TIME_ZONE;
}

function requireData<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error || !data) throw new Error(error?.message ?? `${label} was not found.`);
  return data;
}

function mutationData(
  sourceId: string,
  sourceType: CalendarMutationData["sourceType"],
  record: unknown,
): CalendarMutationData {
  return {
    sourceId,
    sourceType,
    record: record ? (record as Record<string, unknown>) : null,
  };
}

async function reconcile(supabase: Supabase, scope: RpgReconciliationScope) {
  await requestLifeRpgReconciliation(supabase, [scope]);
}

function refreshCalendarSurfaces(sourceType?: CalendarMutationData["sourceType"]) {
  revalidatePath("/calendar");
  revalidatePath("/overview");
  if (sourceType === "task") revalidatePath("/tasks");
  if (sourceType === "bill") revalidatePath("/money");
  if (sourceType === "chore") revalidatePath("/home");
}

function requireSeriesForStoredRecurrence(recurrence: string | null | undefined, scope: string | undefined) {
  if (normalizeRecurrenceAlias(recurrence as CalendarEventEditorInput["recurrence"]).recurrence !== "none" && scope !== "series") {
    throw new Error("Recurring items can only be changed for the entire series.");
  }
}

export async function createInteractiveCalendarEventAction(
  rawInput: CreateInteractiveCalendarEventInput,
): Promise<CalendarMutationResult<CalendarMutationData>> {
  return runAction(async () => {
    const input = eventEditorSchema.parse(rawInput) as CalendarEventEditorInput;
    const { supabase, userId } = await requireMutationUser();
    const timeZone = await getUserTimeZone(supabase, userId);
    const write = buildCalendarEventWrite(input, timeZone);
    const result = await supabase
      .from("calendar_events")
      .insert({ ...write, user_id: userId })
      .select("*")
      .single();
    const event = requireData(result.data, result.error, "Calendar event");
    await reconcile(supabase, "calendar");
    refreshCalendarSurfaces();
    return mutationData(event.id, "event", event);
  });
}

export async function updateInteractiveCalendarEventAction(
  rawInput: UpdateInteractiveCalendarEventInput,
): Promise<CalendarMutationResult<CalendarMutationData>> {
  return runAction(async () => {
    const input = updateEventSchema.parse(rawInput);
    const { supabase, userId } = await requireMutationUser();
    const currentResult = await supabase
      .from("calendar_events")
      .select("id,recurrence")
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .single();
    const current = requireData(currentResult.data, currentResult.error, "Calendar event");
    requireSeriesForStoredRecurrence(current.recurrence, input.scope);

    const timeZone = await getUserTimeZone(supabase, userId);
    const write = buildCalendarEventWrite(input, timeZone);
    await reconcile(supabase, "calendar");
    const result = await supabase
      .from("calendar_events")
      .update(write)
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .select("*")
      .single();
    const event = requireData(result.data, result.error, "Calendar event");
    await reconcile(supabase, "calendar");
    refreshCalendarSurfaces();
    return mutationData(event.id, "event", event);
  });
}

export async function deleteInteractiveCalendarEventAction(
  rawInput: DeleteInteractiveCalendarEventInput,
): Promise<CalendarMutationResult<CalendarMutationData>> {
  return runAction(async () => {
    const input = deleteEventSchema.parse(rawInput);
    const { supabase, userId } = await requireMutationUser();
    const currentResult = await supabase
      .from("calendar_events")
      .select("id,recurrence")
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .single();
    const current = requireData(currentResult.data, currentResult.error, "Calendar event");
    requireSeriesForStoredRecurrence(current.recurrence, input.scope);

    await reconcile(supabase, "calendar");
    const result = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .select("id")
      .single();
    const deleted = requireData(result.data, result.error, "Calendar event");
    await reconcile(supabase, "calendar");
    refreshCalendarSurfaces();
    return mutationData(deleted.id, "event", null);
  });
}

export async function moveCalendarItemAction(
  rawInput: MoveCalendarItemInput,
): Promise<CalendarMutationResult<CalendarMutationData>> {
  return runAction(async () => {
    const input = moveSchema.parse(rawInput) as MoveCalendarItemInput;
    const { supabase, userId } = await requireMutationUser();
    const timeZone = await getUserTimeZone(supabase, userId);

    switch (input.sourceType) {
      case "event": {
        const currentResult = await supabase
          .from("calendar_events")
          .select("id,user_id,title,start_at,end_at,all_day,recurrence,recurrence_interval,recurrence_days_of_week,recurrence_end_date,recurrence_count")
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .single();
        const current = requireData(currentResult.data, currentResult.error, "Calendar event");
        const plan = planCalendarItemMove(input, { sourceType: "event", record: current }, timeZone);
        await reconcile(supabase, "calendar");
        const updateResult = await supabase
          .from("calendar_events")
          .update(plan.patch)
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .select("*")
          .single();
        const updated = requireData(updateResult.data, updateResult.error, "Calendar event");
        await reconcile(supabase, plan.reconciliationScope);
        refreshCalendarSurfaces("event");
        return mutationData(updated.id, "event", updated);
      }
      case "task": {
        const currentResult = await supabase
          .from("tasks")
          .select("id,due_date,due_time,recurrence,status")
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .single();
        const current = requireData(currentResult.data, currentResult.error, "Task");
        const plan = planCalendarItemMove(input, { sourceType: "task", record: current }, timeZone);
        const updateResult = await supabase
          .from("tasks")
          .update(plan.patch)
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .select("*")
          .single();
        const updated = requireData(updateResult.data, updateResult.error, "Task");
        await reconcile(supabase, plan.reconciliationScope);
        refreshCalendarSurfaces("task");
        return mutationData(updated.id, "task", updated);
      }
      case "bill": {
        const currentResult = await supabase
          .from("bills")
          .select("id,next_due_date,recurring,recurrence,active")
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .single();
        const current = requireData(currentResult.data, currentResult.error, "Bill");
        const plan = planCalendarItemMove(input, { sourceType: "bill", record: current }, timeZone);
        const updateResult = await supabase
          .from("bills")
          .update(plan.patch)
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .select("*")
          .single();
        const updated = requireData(updateResult.data, updateResult.error, "Bill");
        await reconcile(supabase, plan.reconciliationScope);
        refreshCalendarSurfaces("bill");
        return mutationData(updated.id, "bill", updated);
      }
      case "chore": {
        const currentResult = await supabase
          .from("chores")
          .select("id,next_due_date,frequency,status")
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .single();
        const current = requireData(currentResult.data, currentResult.error, "Chore");
        const plan = planCalendarItemMove(input, { sourceType: "chore", record: current }, timeZone);
        const updateResult = await supabase
          .from("chores")
          .update(plan.patch)
          .eq("id", input.sourceId)
          .eq("user_id", userId)
          .select("*")
          .single();
        const updated = requireData(updateResult.data, updateResult.error, "Chore");
        await reconcile(supabase, plan.reconciliationScope);
        refreshCalendarSurfaces("chore");
        return mutationData(updated.id, "chore", updated);
      }
    }
  });
}

export async function resizeCalendarEventAction(
  rawInput: ResizeCalendarEventInput,
): Promise<CalendarMutationResult<CalendarMutationData>> {
  return runAction(async () => {
    const input = resizeSchema.parse(rawInput);
    const { supabase, userId } = await requireMutationUser();
    const timeZone = await getUserTimeZone(supabase, userId);
    const currentResult = await supabase
      .from("calendar_events")
      .select("id,user_id,title,start_at,end_at,all_day,recurrence,recurrence_interval,recurrence_days_of_week,recurrence_end_date,recurrence_count")
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .single();
    const current = requireData(currentResult.data, currentResult.error, "Calendar event");
    const patch = planCalendarEventResize(input, current, timeZone);

    await reconcile(supabase, "calendar");
    const updateResult = await supabase
      .from("calendar_events")
      .update(patch)
      .eq("id", input.sourceId)
      .eq("user_id", userId)
      .select("*")
      .single();
    const updated = requireData(updateResult.data, updateResult.error, "Calendar event");
    await reconcile(supabase, "calendar");
    refreshCalendarSurfaces();
    return mutationData(updated.id, "event", updated);
  });
}
