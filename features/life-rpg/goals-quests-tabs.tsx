"use client";

import { GoalManager } from "@/features/goals/goal-components";
import { QuestManager } from "@/features/life-rpg/quest-components";
import type { Goal, GoalUpdate, RpgQuest } from "@/types/domain";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function GoalsQuestsTabs({ goals, updates, quests, defaultTab }: { goals: Goal[]; updates: GoalUpdate[]; quests: RpgQuest[]; defaultTab: "goals" | "quests" }) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList aria-label="Goals and quests">
        <TabsTrigger value="goals">Goals</TabsTrigger>
        <TabsTrigger value="quests">Quests</TabsTrigger>
      </TabsList>
      <TabsContent value="goals"><GoalManager goals={goals} updates={updates} /></TabsContent>
      <TabsContent value="quests"><QuestManager quests={quests} /></TabsContent>
    </Tabs>
  );
}
