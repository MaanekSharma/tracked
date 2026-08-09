import { format } from "date-fns";
import { ArrowRight, CalendarClock, Check, Home, Target } from "lucide-react";
import Link from "next/link";
import { BudgetMiniChart } from "@/features/dashboard/budget-mini-chart";
import { completeChoreAction, completeTaskAction, markBillPaidAction } from "@/features/actions";
import { getDashboardData } from "@/lib/data";
import { getGoalPercent, isOverdue } from "@/lib/calculations";
import { formatDate, money, percentage, toNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenRedirect } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = await getDashboardData();
  const totalBudget = data.budgets.reduce((total, budget) => total + toNumber(budget.amount), 0);
  const activeGoals = data.goals.filter((goal) => goal.status === "active").slice(0, 4);
  const dueChores = data.chores.filter((chore) => chore.status === "active" && chore.next_due_date).slice(0, 4);
  const firstUse =
    data.accounts.length === 0 &&
    data.monthlyTransactions.length === 0 &&
    data.tasks.length === 0 &&
    data.goals.length === 0 &&
    data.bills.length === 0 &&
    data.chores.length === 0;

  const chartData = data.budgetProgress.slice(0, 6).map((budget) => ({
    name: budget.budget_categories?.name ?? "Budget",
    spent: budget.spent,
    budget: toNumber(budget.amount),
  }));

  return (
    <>
      <PageHeader title={greeting()} description={format(new Date(), "EEEE, MMMM d")}>
        <Button asChild variant="outline">
          <Link href="/money">
            Money
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </PageHeader>
      <PageNotice notice={params.notice} error={params.error} />

      {firstUse ? (
        <Card className="mb-6 border-primary/40 bg-primary/10">
          <CardHeader>
            <CardTitle>Welcome to TRACKED</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
            <Link href="/money" className="rounded-md border bg-card p-3 font-semibold text-foreground hover:bg-accent">
              Add your first account
            </Link>
            <Link href="/money" className="rounded-md border bg-card p-3 font-semibold text-foreground hover:bg-accent">
              Enter a transaction
            </Link>
            <Link href="/tasks" className="rounded-md border bg-card p-3 font-semibold text-foreground hover:bg-accent">
              Create a task
            </Link>
            <Link href="/goals" className="rounded-md border bg-card p-3 font-semibold text-foreground hover:bg-accent">
              Define a goal
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Net worth" value={money(data.netWorth)} detail="Assets minus liabilities" />
        <StatCard
          label="Monthly spending"
          value={`${money(data.monthlySpending)}${totalBudget ? ` / ${money(totalBudget)}` : ""}`}
          detail={totalBudget ? `${Math.round((data.monthlySpending / totalBudget) * 100)}% of budget used` : "Set budgets to track progress"}
        />
        <StatCard
          label="Savings rate"
          value={data.savingsRate === null ? "No income yet" : percentage(data.savingsRate)}
          detail={data.profile?.savings_rate_target ? `Target ${percentage(Number(data.profile.savings_rate_target))}` : "Based on income minus expenses"}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Budget snapshot</CardTitle>
            <Link href="/money" className="text-sm font-semibold text-primary hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent>
            {data.budgetProgress.length ? (
              <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
                <div className="space-y-4">
                  {data.budgetProgress.slice(0, 5).map((budget) => (
                    <div key={budget.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">{budget.budget_categories?.name ?? "Budget"}</span>
                        <span className="text-muted-foreground">
                          {money(budget.spent)} / {money(budget.amount)}
                        </span>
                      </div>
                      <Progress value={budget.percent} />
                    </div>
                  ))}
                </div>
                <BudgetMiniChart data={chartData} />
              </div>
            ) : (
              <EmptyState title="No budgets yet" description="Create month-specific budgets in Money to see spend against plan." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Today&apos;s tasks</CardTitle>
            <Link href="/tasks" className="text-sm font-semibold text-primary hover:underline">
              Open
            </Link>
          </CardHeader>
          <CardContent>
            {data.tasks.length ? (
              <div className="space-y-3">
                {data.tasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-md border bg-background p-3">
                    <form action={completeTaskAction}>
                      <HiddenRedirect to="/overview" />
                      <input type="hidden" name="id" value={task.id} />
                      <Button size="icon" variant="outline" aria-label={`Complete ${task.title}`}>
                        <Check className="size-4" />
                      </Button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.priority} priority</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No tasks due today" description="Anything added with today's due date will land here." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length ? (
              <div className="space-y-3">
                {data.upcoming.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <Badge variant={isOverdue(item.date) ? "destructive" : "secondary"}>{formatDate(item.date, "MMM d")}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nothing upcoming" description="Bills, events, chores, and dated tasks appear here." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              Goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeGoals.length ? (
              <div className="space-y-4">
                {activeGoals.map((goal) => {
                  const percent = getGoalPercent(goal);
                  return (
                    <div key={goal.id}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold">{goal.title}</span>
                        <span className="text-muted-foreground">{Math.round(percent)}%</span>
                      </div>
                      <Progress value={percent} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No active goals" description="Create measurable goals to track progress over time." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="size-4 text-primary" />
              Home attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.bills.length || dueChores.length ? (
              <div className="space-y-3">
                {data.bills.slice(0, 3).map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                    <div>
                      <p className="text-sm font-semibold">{bill.name}</p>
                      <p className="text-xs text-muted-foreground">{money(bill.amount, true)} due {formatDate(bill.next_due_date, "MMM d")}</p>
                    </div>
                    <form action={markBillPaidAction}>
                      <HiddenRedirect to="/overview" />
                      <input type="hidden" name="id" value={bill.id} />
                      <Button size="sm" variant="outline">Paid</Button>
                    </form>
                  </div>
                ))}
                {dueChores.map((chore) => (
                  <div key={chore.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                    <div>
                      <p className="text-sm font-semibold">{chore.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(chore.next_due_date, "MMM d")}</p>
                    </div>
                    <form action={completeChoreAction}>
                      <HiddenRedirect to="/overview" />
                      <input type="hidden" name="id" value={chore.id} />
                      <input type="hidden" name="frequency" value={chore.frequency} />
                      <Button size="sm" variant="outline">Done</Button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Home is current" description="Active bills and due chores will surface here." />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
