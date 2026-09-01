import Link from "next/link";
import {
  ArrowRight, BookOpen, Brain, BriefcaseBusiness, CalendarClock, Check, CircleDollarSign,
  Dumbbell, HeartPulse, Home, Minus, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { completeChoreAction, completeTaskAction, markBillPaidAction } from "@/features/actions";
import { MilestonePresentation, WeeklyHistoryDialog } from "@/features/life-rpg/character-dashboard-client";
import { CATEGORY_LABELS, type RpgCategory, type RpgDashboardViewModel } from "@/lib/life-rpg";
import { formatDate, money, percentage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenRedirect } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";

const statIcons = {
  strength: Dumbbell,
  health: HeartPulse,
  wealth: CircleDollarSign,
  career: BriefcaseBusiness,
  knowledge: Brain,
  discipline: ShieldCheck,
  social: Users,
} satisfies Record<RpgCategory, React.ComponentType<{ className?: string }>>;

function Delta({ value }: { value: number | null }) {
  if (!value) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-3" /> steady</span>;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-1 ${value > 0 ? "text-primary" : "text-destructive"}`}><Icon className="size-3" /> {value > 0 ? "+" : ""}{value}</span>;
}

function SectionLabel({ code, title, action }: { code: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-muted-foreground">{code}</p>
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function CharacterDashboard({ dashboard }: { dashboard: RpgDashboardViewModel }) {
  const { level } = dashboard.profile;
  const activeEffects = dashboard.effects.filter((effect) => effect.active);
  const totalMonthlyBudget = dashboard.money.budgetUsedPercent;
  return (
    <div className="space-y-5">
      <MilestonePresentation presentation={dashboard.presentation} level={level.level} />

      <header className="rpg-dossier relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm sm:p-7">
        <div aria-hidden className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_68%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono uppercase tracking-[0.16em]">Character dossier</Badge>
              <Badge variant={dashboard.initialized ? "secondary" : "muted"}>Ruleset v{dashboard.profile.rulesetVersion}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] sm:text-5xl">{dashboard.profile.displayName}</h1>
            <div className="mt-6 max-w-2xl">
              <div className="mb-2 flex items-center justify-between gap-3 font-mono text-xs">
                <span>{Math.round(level.xpIntoLevel).toLocaleString("en-CA")} XP</span>
                <span className="text-muted-foreground">{Math.round(level.xpForNextLevel).toLocaleString("en-CA")} to clear</span>
              </div>
              <Progress value={level.percent} className="h-3 border bg-background" aria-label={`Level ${level.level} progress ${Math.round(level.percent)} percent`} />
            </div>
          </div>
          <div className="flex items-end justify-between gap-6 border-t pt-5 lg:block lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-muted-foreground">Current level</p>
              <p className="font-mono text-6xl font-black leading-none text-primary sm:text-7xl">{level.level}</p>
            </div>
            <p className="text-right font-mono text-xs text-muted-foreground lg:mt-3">{Math.round(dashboard.profile.totalAwardedXp).toLocaleString("en-CA")} earned XP</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="character-stats">
        <SectionLabel code="01 / ATTRIBUTES" title="Character stats" />
        <h2 id="character-stats" className="sr-only">Character stats</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {dashboard.stats.map((stat) => {
            const Icon = statIcons[stat.category];
            return (
              <article key={stat.category} title={stat.detail} className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="font-mono text-[0.62rem] uppercase text-muted-foreground">L{stat.progress.level}</span>
                </div>
                <p className="mt-5 font-mono text-3xl font-black leading-none">{stat.value}</p>
                <p className="mt-1 text-xs font-bold">{stat.label}</p>
                <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[0.62rem]">
                  <Delta value={stat.delta} />
                  <span className="text-muted-foreground">{stat.quality}</span>
                </div>
                <Progress value={stat.progress.percent} className="mt-3 h-1" aria-label={`${stat.label} category level ${stat.progress.level}, ${Math.round(stat.progress.percent)} percent`} />
                <p className="sr-only">{stat.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <section className="xl:col-span-7" aria-labelledby="quests-title">
          <SectionLabel code="02 / MISSIONS" title="Active quests & goals" action={<Button asChild variant="ghost" size="sm"><Link href="/goals?tab=quests">Open log <ArrowRight className="size-4" /></Link></Button>} />
          <h2 id="quests-title" className="sr-only">Active quests and goals</h2>
          <Card>
            <CardContent className="p-4 sm:p-5">
              {dashboard.quests.length || dashboard.goals.length ? (
                <div className="space-y-3">
                  {dashboard.quests.map((quest) => (
                    <Link key={quest.id} href="/goals?tab=quests" className="block rounded-md border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge variant={quest.difficulty === "boss" ? "destructive" : "secondary"}>{quest.type} · {quest.difficulty}</Badge>
                            <span className="font-mono text-[0.62rem] uppercase text-muted-foreground">{CATEGORY_LABELS[quest.primaryCategory]}</span>
                          </div>
                          <p className="truncate font-semibold">{quest.title}</p>
                          <p className="text-xs text-muted-foreground">{quest.objectives.filter((objective) => objective.complete).length}/{quest.objectives.length} objectives{quest.endsOn ? ` · ends ${formatDate(quest.endsOn, "MMM d")}` : ""}</p>
                        </div>
                        <span className="font-mono text-sm font-bold">{quest.progress}%</span>
                      </div>
                      <Progress value={quest.progress} className="mt-3" aria-label={`${quest.title} ${quest.progress}% complete`} />
                    </Link>
                  ))}
                  {dashboard.goals.map((goal) => (
                    <Link key={goal.id} href="/goals" className="block rounded-md border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2"><BookOpen className="size-4 shrink-0 text-primary" /><span className="truncate text-sm font-semibold">{goal.title}</span></div>
                        <span className="font-mono text-xs">{Math.round(goal.progress)}%</span>
                      </div>
                      <Progress value={goal.progress} aria-label={`${goal.title} ${Math.round(goal.progress)}% complete`} />
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="No active missions" description="Create a measurable goal or a quest. Automatic quests appear only when reliable planned work exists." />}
            </CardContent>
          </Card>
        </section>

        <section className="xl:col-span-5" aria-labelledby="today-title">
          <SectionLabel code="03 / TODAY" title="Today" action={<Button asChild variant="ghost" size="sm"><Link href="/calendar">Calendar <ArrowRight className="size-4" /></Link></Button>} />
          <h2 id="today-title" className="sr-only">Today</h2>
          <Card>
            <CardContent className="p-4 sm:p-5">
              {dashboard.today.length ? <div className="space-y-2">{dashboard.today.slice(0, 7).map((item) => (
                <div key={`${item.sourceType}:${item.id}`} className="flex items-center gap-3 rounded-md border bg-background p-3">
                  {item.sourceType === "task" ? (
                    <form action={completeTaskAction}><HiddenRedirect to="/overview" /><input type="hidden" name="id" value={item.sourceId} /><Button size="icon" variant="outline" aria-label={`Complete ${item.title}`}><Check className="size-4" /></Button></form>
                  ) : item.sourceType === "chore" ? (
                    <form action={completeChoreAction}><HiddenRedirect to="/overview" /><input type="hidden" name="id" value={item.sourceId} /><Button size="icon" variant="outline" aria-label={`Complete ${item.title}`}><Home className="size-4" /></Button></form>
                  ) : item.sourceType === "bill" ? (
                    <form action={markBillPaidAction}><HiddenRedirect to="/overview" /><input type="hidden" name="id" value={item.sourceId} /><Button size="icon" variant="outline" aria-label={`Mark ${item.title} paid`}><CircleDollarSign className="size-4" /></Button></form>
                  ) : <span className="grid size-9 place-items-center rounded-md border text-primary"><CalendarClock className="size-4" /></span>}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="truncate text-xs capitalize text-muted-foreground">{item.detail}</p></div>
                  <Badge variant="muted">{item.sourceType}</Badge>
                </div>
              ))}</div> : <EmptyState title="Clear field today" description="Dated tasks, chores, bills, and calendar events scheduled for today appear here." />}
            </CardContent>
          </Card>
        </section>

        <section className="xl:col-span-5" aria-labelledby="effects-title">
          <SectionLabel code="04 / MODIFIERS" title="Status effects" />
          <h2 id="effects-title" className="sr-only">Status effects</h2>
          <Card><CardContent className="space-y-3 p-4 sm:p-5">
            {dashboard.effects.map((effect) => (
              <div key={effect.key} className={`rounded-md border p-3 ${effect.active ? "border-primary/40 bg-primary/10" : "bg-background opacity-65"}`}>
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{effect.name}</p><Badge variant={effect.active ? "secondary" : "muted"}>{effect.active ? `${effect.delta > 0 ? "+" : ""}${Math.round(effect.delta * 100)}% Discipline XP` : "Inactive"}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{effect.description}</p>
              </div>
            ))}
            {!activeEffects.length ? <p className="text-xs text-muted-foreground">No active modifiers. Your base XP rates are in effect.</p> : null}
          </CardContent></Card>
        </section>

        <section className="xl:col-span-7" aria-labelledby="week-title">
          <SectionLabel code="05 / FIELD REPORT" title="This week" action={<WeeklyHistoryDialog history={dashboard.history} />} />
          <h2 id="week-title" className="sr-only">This week</h2>
          <Card><CardContent className="grid gap-5 p-5 sm:grid-cols-[auto_1fr]">
            <div className="grid size-24 place-items-center rounded-lg border bg-background font-mono text-4xl font-black text-primary">{dashboard.week.grade}</div>
            <div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="font-mono text-xl font-black">{Math.round(dashboard.week.xp)}</p><p className="text-xs text-muted-foreground">XP</p></div>
                <div><p className="font-mono text-xl font-black">{dashboard.week.productiveDays}/5</p><p className="text-xs text-muted-foreground">Productive</p></div>
                <div><p className="font-mono text-xl font-black">{dashboard.week.questCompleted}/{dashboard.week.questTotal}</p><p className="text-xs text-muted-foreground">Quests</p></div>
              </div>
              <Progress value={dashboard.week.gradeScore} className="mt-5" aria-label={`Weekly grade score ${dashboard.week.gradeScore} percent`} />
              <p className="mt-2 text-xs text-muted-foreground">Week of {formatDate(dashboard.week.weekStart, "MMM d")} · current streak {dashboard.week.streak} days</p>
            </div>
          </CardContent></Card>
        </section>

        <section className="xl:col-span-7" aria-labelledby="money-title">
          <SectionLabel code="06 / RESOURCES" title="Money snapshot" action={<Button asChild variant="ghost" size="sm"><Link href="/money">Money <ArrowRight className="size-4" /></Link></Button>} />
          <h2 id="money-title" className="sr-only">Money snapshot</h2>
          <Card><CardContent className="grid gap-5 p-5 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Net worth</p><p className="mt-1 font-mono text-2xl font-black">{money(dashboard.money.netWorth)}</p></div>
            <div><p className="text-xs text-muted-foreground">Month spending</p><p className="mt-1 font-mono text-2xl font-black">{money(dashboard.money.spending)}</p><p className="mt-1 text-xs text-muted-foreground">{totalMonthlyBudget === null ? "No monthly budget" : `${Math.round(totalMonthlyBudget)}% of budget`}</p></div>
            <div><p className="text-xs text-muted-foreground">Savings rate</p><p className="mt-1 font-mono text-2xl font-black">{dashboard.money.savingsRate === null ? "—" : percentage(dashboard.money.savingsRate)}</p><p className="mt-1 text-xs text-muted-foreground">{dashboard.money.savingsTarget === null ? "No target set" : `${percentage(dashboard.money.savingsTarget)} target`}</p></div>
          </CardContent></Card>
        </section>

        <section className="xl:col-span-5" aria-labelledby="achievements-title">
          <SectionLabel code="07 / ARCHIVE" title="Recent achievements" />
          <h2 id="achievements-title" className="sr-only">Recent achievements</h2>
          <Card><CardContent className="p-4 sm:p-5">
            {dashboard.achievements.length ? <div className="space-y-2">{dashboard.achievements.map((achievement) => (
              <div key={achievement.key} className="flex items-center gap-3 rounded-md border bg-background p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border bg-card text-primary"><Sparkles className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{achievement.name}</p><p className="text-xs text-muted-foreground">{achievement.rarity} · {formatDate(achievement.unlockedAt, "MMM d")}</p></div>
                {achievement.baseline ? <Badge variant="muted">Baseline</Badge> : <Badge variant="secondary">Earned</Badge>}
              </div>
            ))}</div> : <EmptyState title="No badges unlocked" description="Durable milestones appear here without reconstructing historical XP." />}
          </CardContent></Card>
        </section>
      </div>
    </div>
  );
}
