"use client";

import { useEffect, useState } from "react";
import { Award, ChevronRight, Crown, History, Sparkles } from "lucide-react";
import type { RpgDashboardViewModel, RpgWeeklySnapshotView } from "@/lib/life-rpg";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export function MilestonePresentation({ presentation, level }: { presentation: RpgDashboardViewModel["presentation"]; level: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!presentation.acknowledgementKey) return;
    const storageKey = `tracked-rpg-ack:${presentation.acknowledgementKey}`;
    if (!window.localStorage.getItem(storageKey)) {
      const timer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [presentation.acknowledgementKey]);

  if (!presentation.acknowledgementKey) return null;
  const achievement = presentation.rareAchievement;
  const boss = presentation.bossComplete;
  const title = achievement ? achievement.name : boss ? "Boss Cleared" : `Level ${level}`;
  const detail = achievement ? achievement.description : boss ? `${boss.title} is complete.` : "Your character level increased.";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen && presentation.acknowledgementKey) window.localStorage.setItem(`tracked-rpg-ack:${presentation.acknowledgementKey}`, new Date().toISOString());
    }}>
      <DialogContent className="overflow-hidden border-primary/50 bg-card text-center sm:max-w-md">
        <div aria-hidden className="rpg-milestone-orbit absolute left-1/2 top-4 size-36 -translate-x-1/2 rounded-full border border-primary/30" />
        <div className="relative mx-auto mt-5 grid size-20 place-items-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-[0_0_60px_color-mix(in_oklab,var(--primary)_28%,transparent)]">
          {boss ? <Crown className="size-9" /> : achievement ? <Award className="size-9" /> : <Sparkles className="size-9" />}
        </div>
        <DialogHeader className="relative items-center text-center">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.28em] text-primary">Milestone recorded</p>
          <DialogTitle className="text-2xl font-black tracking-tight">{title}</DialogTitle>
          <DialogDescription>{detail}</DialogDescription>
        </DialogHeader>
        <Button className="relative mx-auto" onClick={() => setOpen(false)}>Acknowledge</Button>
      </DialogContent>
    </Dialog>
  );
}

export function WeeklyHistoryDialog({ history }: { history: RpgWeeklySnapshotView[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><History className="size-4" /> History</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Weekly field reports</DialogTitle>
          <DialogDescription>Finalized Sunday–Saturday records are permanent; the current week stays live.</DialogDescription>
        </DialogHeader>
        {history.length ? (
          <div className="space-y-3">
            {history.map((week) => (
              <details key={week.weekStart} className="group rounded-md border bg-background p-4" open={!week.finalized}>
                <summary className="flex cursor-pointer list-none items-center gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-card font-mono text-lg font-black text-primary">{week.grade}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{formatDate(week.weekStart, "MMM d")} – {formatDate(week.weekEnd, "MMM d")}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(week.xp)} XP · {week.productiveDays} productive days · {week.questCompleted}/{week.questTotal} quests</p>
                  </div>
                  <Badge variant={week.finalized ? "muted" : "secondary"}>{week.finalized ? "Final" : "Live"}</Badge>
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(week.categoryLevels).map(([category, categoryLevel]) => (
                    <div key={category} className="rounded-md border bg-card px-3 py-2">
                      <p className="text-xs capitalize text-muted-foreground">{category}</p>
                      <p className="font-mono text-sm font-bold">Level {categoryLevel}</p>
                    </div>
                  ))}
                  <div className="rounded-md border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Best streak</p>
                    <p className="font-mono text-sm font-bold">{week.streak} days</p>
                  </div>
                </div>
                {week.achievements.length ? <p className="mt-3 text-xs text-muted-foreground">Unlocked: {week.achievements.map((item) => item.name).join(", ")}</p> : null}
              </details>
            ))}
          </div>
        ) : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Your first field report will appear after reconciliation records this week.</div>}
      </DialogContent>
    </Dialog>
  );
}
