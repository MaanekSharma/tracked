"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  QUEST_TYPES,
  RPG_CATEGORIES,
  RPG_DIFFICULTIES,
  validateQuestDifficulty,
} from "@/lib/life-rpg";
import { requestLifeRpgReconciliation } from "@/lib/life-rpg/reconcile";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const optionalCategory = z.preprocess((value) => value === "" ? null : value, z.enum(RPG_CATEGORIES).nullable());
const questSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().transform((value) => value || null),
  quest_type: z.enum(QUEST_TYPES),
  primary_category: z.enum(RPG_CATEGORIES),
  secondary_category: optionalCategory,
  difficulty: z.enum(RPG_DIFFICULTIES),
  starts_on: z.string().date(),
  ends_on: z.string().transform((value) => value || null),
});
const trackingTypes = ["manual", "task_completion", "chore_completion", "goal_progress"] as const;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function texts(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function target(formData: FormData) {
  const value = text(formData, "redirectTo");
  return value.startsWith("/") ? value : "/goals";
}

function resultUrl(path: string, key: "notice" | "error", value: string) {
  const url = new URL(path, "http://tracked.local");
  url.searchParams.set("tab", "quests");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

async function requireContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please sign in again before changing quests.");
  return { supabase, user };
}

async function questMutation(formData: FormData, operation: (context: Awaited<ReturnType<typeof requireContext>>) => Promise<void>, notice: string) {
  const path = target(formData);
  let error: string | null = null;
  try {
    const context = await requireContext();
    await operation(context);
    await requestLifeRpgReconciliation(context.supabase, ["quest"]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to change this quest.";
  }
  revalidatePath("/goals");
  revalidatePath("/overview");
  redirect(resultUrl(path, error ? "error" : "notice", error ?? notice));
}

export async function createQuestAction(formData: FormData) {
  await questMutation(formData, async ({ supabase, user }) => {
    const input = questSchema.parse({
      title: text(formData, "title"),
      description: text(formData, "description"),
      quest_type: text(formData, "quest_type"),
      primary_category: text(formData, "primary_category"),
      secondary_category: text(formData, "secondary_category"),
      difficulty: text(formData, "difficulty"),
      starts_on: text(formData, "starts_on"),
      ends_on: text(formData, "ends_on"),
    });
    if (input.ends_on && input.ends_on < input.starts_on) throw new Error("Quest end must be on or after its start.");

    const objectiveTexts = texts(formData, "objective").map((value) => value.trim());
    const objectiveTargets = texts(formData, "objective_target");
    const objectiveTracking = texts(formData, "objective_tracking");
    const objectiveSources = texts(formData, "objective_source");
    const objectiveCategories = texts(formData, "objective_category");
    const objectives = objectiveTexts.map((objective, position) => ({
      objective,
      position,
      tracking_type: z.enum(trackingTypes).parse(objectiveTracking[position] || "manual"),
      target_value: z.coerce.number().positive().parse(objectiveTargets[position] || "1"),
      source_record_id: objectiveSources[position]?.trim() || null,
      category_filter: optionalCategory.parse(objectiveCategories[position] ?? ""),
    })).filter((objective) => objective.objective.length > 0);
    if (!objectives.length) throw new Error("Add at least one quest objective.");
    const validation = validateQuestDifficulty(input.quest_type, input.difficulty, objectives.length);
    if (!validation.valid) throw new Error(validation.message ?? "Invalid quest difficulty.");

    const { data: quest, error } = await supabase.from("rpg_quests").insert({ ...input, user_id: user.id }).select("id").single();
    if (error || !quest) throw new Error(error?.message ?? "Unable to create quest.");
    const { error: objectiveError } = await supabase.from("rpg_quest_objectives").insert(
      objectives.map((objective) => ({ ...objective, quest_id: quest.id, user_id: user.id })),
    );
    if (objectiveError) {
      await supabase.from("rpg_quests").delete().eq("id", quest.id).eq("user_id", user.id);
      throw new Error(objectiveError.message);
    }
  }, "Quest created");
}

export async function completeQuestObjectiveAction(formData: FormData) {
  await questMutation(formData, async ({ supabase, user }) => {
    const objectiveId = idSchema.parse(text(formData, "objective_id"));
    const questId = idSchema.parse(text(formData, "quest_id"));
    const { data: objective, error } = await supabase
      .from("rpg_quest_objectives")
      .select("tracking_type, target_value")
      .eq("id", objectiveId)
      .eq("quest_id", questId)
      .eq("user_id", user.id)
      .single();
    if (error || !objective) throw new Error(error?.message ?? "Objective not found.");
    if (objective.tracking_type !== "manual") throw new Error("This objective is updated from its linked TRACKED source.");
    const { error: updateError } = await supabase
      .from("rpg_quest_objectives")
      .update({ manual_value: objective.target_value })
      .eq("id", objectiveId)
      .eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);
    const { data: objectives, error: objectiveLoadError } = await supabase
      .from("rpg_quest_objectives")
      .select("manual_value, target_value")
      .eq("quest_id", questId)
      .eq("user_id", user.id);
    if (objectiveLoadError) throw new Error(objectiveLoadError.message);
    if ((objectives ?? []).every((item) => Number(item.manual_value) >= Number(item.target_value))) {
      const { error: completionError } = await supabase.rpc("complete_rpg_quest", { target_quest_id: questId });
      if (completionError) throw new Error(completionError.message);
    }
  }, "Objective completed");
}

export async function abandonQuestAction(formData: FormData) {
  await questMutation(formData, async ({ supabase, user }) => {
    const id = idSchema.parse(text(formData, "id"));
    const { error } = await supabase.from("rpg_quests").update({ status: "abandoned", completed_at: null }).eq("id", id).eq("user_id", user.id).eq("status", "active");
    if (error) throw new Error(error.message);
  }, "Quest abandoned");
}

export async function deleteQuestAction(formData: FormData) {
  await questMutation(formData, async ({ supabase, user }) => {
    const id = idSchema.parse(text(formData, "id"));
    const { error } = await supabase.from("rpg_quests").delete().eq("id", id).eq("user_id", user.id).neq("status", "completed");
    if (error) throw new Error(error.message);
  }, "Quest deleted");
}
