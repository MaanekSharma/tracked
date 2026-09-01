"use client";

import { useState } from "react";
import { Check, Flag, Plus, Trash2 } from "lucide-react";
import {
  abandonQuestAction,
  completeQuestObjectiveAction,
  createQuestAction,
  deleteQuestAction,
} from "@/features/life-rpg/actions";
import {
  CATEGORY_LABELS,
  OPTIONAL_RPG_CATEGORY_OPTIONS,
  RPG_CATEGORY_OPTIONS,
  RPG_DIFFICULTY_OPTIONS,
  type QuestType,
} from "@/lib/life-rpg";
import { formatDate, todayISO, toNumber } from "@/lib/utils";
import type { RpgQuest } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";

const questTypeOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "main", label: "Main" },
];
const trackingOptions = [
  { value: "manual", label: "Manual check-off" },
  { value: "task_completion", label: "Task completions" },
  { value: "chore_completion", label: "Chore completions" },
  { value: "goal_progress", label: "Goal progress" },
];

function defaultDifficulty(type: QuestType) {
  return type === "daily" ? "easy" : type === "weekly" ? "medium" : "hard";
}

function questProgress(quest: RpgQuest) {
  const objectives = quest.rpg_quest_objectives ?? [];
  if (!objectives.length) return 0;
  return Math.round(objectives.reduce((total, objective) => total + Math.min(1, toNumber(objective.manual_value) / toNumber(objective.target_value)), 0) / objectives.length * 100);
}

export function QuestManager({ quests }: { quests: RpgQuest[] }) {
  const [questType, setQuestType] = useState<QuestType>("main");
  const [objectiveCount, setObjectiveCount] = useState(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quest log</CardTitle>
        <CardDescription>Build Main quests or add custom Daily and Weekly commitments. Rewards are derived from category and difficulty.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createQuestAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/goals?tab=quests" />
          <FormGrid>
            <TextField label="Quest title" name="title" required />
            <SelectField label="Type" name="quest_type" value={questType} onChange={(event) => setQuestType(event.target.value as QuestType)} options={questTypeOptions} />
            <SelectField label="Primary stat" name="primary_category" defaultValue="discipline" options={RPG_CATEGORY_OPTIONS} />
            <SelectField label="Secondary stat" name="secondary_category" options={OPTIONAL_RPG_CATEGORY_OPTIONS} />
            <SelectField key={questType} label="Difficulty" name="difficulty" defaultValue={defaultDifficulty(questType)} options={RPG_DIFFICULTY_OPTIONS} />
            <TextField label="Starts" name="starts_on" type="date" defaultValue={todayISO()} required />
            <TextField label="Ends" name="ends_on" type="date" />
          </FormGrid>
          <TextareaField label="Description" name="description" className="mt-4" />

          <div className="mt-5 space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Objectives</p>
                <p className="text-xs text-muted-foreground">Boss difficulty unlocks for a Main quest with three or more objectives.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setObjectiveCount((count) => Math.min(8, count + 1))}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
            {Array.from({ length: objectiveCount }, (_, index) => (
              <div key={index} className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-2 xl:grid-cols-[1.5fr_0.8fr_0.6fr_0.8fr_1fr_auto]">
                <TextField label={`Objective ${index + 1}`} name="objective" required />
                <SelectField label="Tracking" name="objective_tracking" defaultValue="manual" options={trackingOptions} />
                <TextField label="Target" name="objective_target" type="number" min="0.01" step="0.01" defaultValue="1" required />
                <SelectField label="Stat filter" name="objective_category" options={OPTIONAL_RPG_CATEGORY_OPTIONS} />
                <TextField label="Source ID (optional)" name="objective_source" placeholder="Goal, task, or chore UUID" />
                <div className="flex items-end">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove objective ${index + 1}`} disabled={objectiveCount === 1} onClick={() => setObjectiveCount((count) => Math.max(1, count - 1))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="submit" className="mt-4">Create quest</Button>
        </form>

        {quests.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {quests.map((quest) => {
              const objectives = [...(quest.rpg_quest_objectives ?? [])].sort((a, b) => a.position - b.position);
              const progress = questProgress(quest);
              return (
                <article key={quest.id} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{quest.quest_type}</Badge>
                        <Badge variant={quest.difficulty === "boss" ? "destructive" : "secondary"}>{quest.difficulty}</Badge>
                        <Badge variant="muted">{CATEGORY_LABELS[quest.primary_category]}</Badge>
                      </div>
                      <h3 className="font-semibold">{quest.title}</h3>
                      <p className="text-xs text-muted-foreground">{quest.ends_on ? `Ends ${formatDate(quest.ends_on)}` : "Open-ended"}</p>
                    </div>
                    <Badge variant={quest.status === "active" ? "secondary" : "muted"}>{quest.status}</Badge>
                  </div>
                  <Progress value={progress} className="mt-4" aria-label={`${quest.title} ${progress}% complete`} />
                  <div className="mt-4 space-y-2">
                    {objectives.map((objective) => {
                      const complete = toNumber(objective.manual_value) >= toNumber(objective.target_value);
                      return (
                        <div key={objective.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
                          {quest.status === "active" && objective.tracking_type === "manual" && !complete ? (
                            <form action={completeQuestObjectiveAction}>
                              <HiddenRedirect to="/goals?tab=quests" />
                              <input type="hidden" name="quest_id" value={quest.id} />
                              <input type="hidden" name="objective_id" value={objective.id} />
                              <Button size="icon" variant="outline" aria-label={`Complete ${objective.objective}`}><Check className="size-4" /></Button>
                            </form>
                          ) : <span className={`grid size-9 place-items-center rounded-md border ${complete ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Check className="size-4" /></span>}
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium ${complete ? "line-through opacity-60" : ""}`}>{objective.objective}</p>
                            <p className="text-xs text-muted-foreground">{toNumber(objective.manual_value)} / {toNumber(objective.target_value)} · {objective.tracking_type.replaceAll("_", " ")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {quest.status === "active" ? (
                    <form action={abandonQuestAction} className="mt-4">
                      <HiddenRedirect to="/goals?tab=quests" />
                      <input type="hidden" name="id" value={quest.id} />
                      <Button variant="outline" size="sm"><Flag className="size-4" /> Abandon</Button>
                    </form>
                  ) : quest.status !== "completed" ? (
                    <form action={deleteQuestAction} className="mt-4">
                      <HiddenRedirect to="/goals?tab=quests" />
                      <input type="hidden" name="id" value={quest.id} />
                      <Button variant="outline" size="sm"><Trash2 className="size-4" /> Delete</Button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="No quests yet" description="Create a quest above. Automatic Daily and Weekly quests appear only when TRACKED has reliable planned work." />}
      </CardContent>
    </Card>
  );
}
