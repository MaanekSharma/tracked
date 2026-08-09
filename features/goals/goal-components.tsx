import { Trash2 } from "lucide-react";
import { addGoalUpdateAction, createGoalAction, deleteGoalAction, updateGoalAction } from "@/features/actions";
import { getGoalPercent } from "@/lib/calculations";
import { formatDate, money, todayISO, toNumber } from "@/lib/utils";
import type { Goal, GoalUpdate } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function goalValue(value: number | string, unit: string) {
  return unit === "dollars" ? money(value) : `${toNumber(value).toLocaleString("en-CA")} ${unit}`;
}

export function GoalManager({ goals, updates }: { goals: Goal[]; updates: GoalUpdate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Goal progress</CardTitle>
        <CardDescription>Track measurable goals with a historical update trail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createGoalAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/goals" />
          <FormGrid>
            <TextField label="Title" name="title" required />
            <TextField label="Category" name="category" placeholder="Finance, health, career" />
            <TextField label="Target value" name="target_value" type="number" min="0.01" step="0.01" required />
            <TextField label="Initial value" name="initial_value" type="number" min="0" step="0.01" defaultValue={0} />
            <TextField label="Unit" name="unit" defaultValue="count" required />
            <TextField label="Start date" name="start_date" type="date" defaultValue={todayISO()} />
            <TextField label="Target date" name="target_date" type="date" />
            <SelectField label="Status" name="status" defaultValue="active" options={statusOptions} />
          </FormGrid>
          <TextareaField label="Description" name="description" className="mt-4" />
          <Button type="submit" className="mt-4">Add goal</Button>
        </form>

        {goals.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {goals.map((goal) => {
              const percent = getGoalPercent(goal);
              const goalUpdates = updates.filter((update) => update.goal_id === goal.id).slice(0, 4);
              return (
                <details key={goal.id} className="rounded-lg border bg-background p-4" open={goal.status === "active"}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{goal.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {goalValue(goal.current_value, goal.unit)} / {goalValue(goal.target_value, goal.unit)}
                        </p>
                      </div>
                      <Badge variant={goal.status === "active" ? "secondary" : "muted"}>{goal.status}</Badge>
                    </div>
                    <Progress value={percent} className="mt-3" />
                  </summary>

                  <form action={addGoalUpdateAction} className="mt-4 grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <HiddenRedirect to="/goals" />
                    <input type="hidden" name="goal_id" value={goal.id} />
                    <TextField label="Progress delta" name="delta" type="number" step="0.01" required />
                    <TextField label="Recorded" name="recorded_at" type="date" defaultValue={todayISO()} />
                    <div className="flex items-end">
                      <Button type="submit" className="w-full">Add update</Button>
                    </div>
                    <TextareaField label="Note" name="note" className="sm:col-span-3" />
                  </form>

                  {goalUpdates.length ? (
                    <div className="mt-4 space-y-2">
                      {goalUpdates.map((update) => (
                        <div key={update.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
                          <span>{goalValue(update.delta, goal.unit)}</span>
                          <span className="text-muted-foreground">{formatDate(update.recorded_at)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <form action={updateGoalAction} className="mt-4 border-t pt-4">
                    <HiddenRedirect to="/goals" />
                    <input type="hidden" name="id" value={goal.id} />
                    <FormGrid>
                      <TextField label="Title" name="title" defaultValue={goal.title} required />
                      <TextField label="Category" name="category" defaultValue={goal.category} />
                      <TextField label="Target value" name="target_value" type="number" min="0.01" step="0.01" defaultValue={goal.target_value} required />
                      <TextField label="Initial value" name="initial_value" type="number" min="0" step="0.01" defaultValue={goal.initial_value} />
                      <TextField label="Unit" name="unit" defaultValue={goal.unit} required />
                      <TextField label="Start date" name="start_date" type="date" defaultValue={goal.start_date} />
                      <TextField label="Target date" name="target_date" type="date" defaultValue={goal.target_date} />
                      <SelectField label="Status" name="status" defaultValue={goal.status} options={statusOptions} />
                    </FormGrid>
                    <TextareaField label="Description" name="description" defaultValue={goal.description} className="mt-4" />
                    <Button type="submit" className="mt-4">Save goal</Button>
                  </form>
                  <form action={deleteGoalAction} className="mt-2">
                    <HiddenRedirect to="/goals" />
                    <input type="hidden" name="id" value={goal.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No goals yet" description="Create a dollar, workout, hour, percentage, or count-based goal." />
        )}
      </CardContent>
    </Card>
  );
}
