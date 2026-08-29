import Link from "next/link";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { completeTaskAction, createTaskAction, deleteTaskAction, reopenTaskAction, updateTaskAction } from "@/features/actions";
import { CalendarRecurrenceFields } from "@/features/calendar/calendar-form-fields";
import { formatDate, todayISO } from "@/lib/utils";
import { type Task } from "@/types/domain";
import { OPTIONAL_RPG_CATEGORY_OPTIONS, RPG_DIFFICULTY_OPTIONS } from "@/lib/life-rpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
const statusOptions = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export function TaskViewNav({ active }: { active: string }) {
  const items = [
    { href: "/tasks", value: "inbox", label: "Inbox" },
    { href: "/tasks?view=today", value: "today", label: "Today" },
    { href: "/tasks?view=upcoming", value: "upcoming", label: "Upcoming" },
    { href: "/tasks?view=completed", value: "completed", label: "Completed" },
  ];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <Button key={item.value} asChild variant={active === item.value ? "default" : "outline"} size="sm">
          <Link href={item.href}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

export function TaskManager({ tasks, view }: { tasks: Task[]; view: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task manager</CardTitle>
        <CardDescription>Create, edit, complete, reopen, and delete personal tasks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createTaskAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to={`/tasks${view === "inbox" ? "" : `?view=${view}`}`} />
          <FormGrid>
            <TextField label="Title" name="title" required />
            <SelectField label="Priority" name="priority" defaultValue="medium" options={priorityOptions} />
            <TextField label="Due date" name="due_date" type="date" defaultValue={view === "today" ? todayISO() : undefined} />
            <TextField label="Due time" name="due_time" type="time" />
            <SelectField label="RPG stat" name="rpg_category" options={OPTIONAL_RPG_CATEGORY_OPTIONS} />
            <SelectField label="Difficulty" name="rpg_difficulty" defaultValue="medium" options={RPG_DIFFICULTY_OPTIONS} />
            <CalendarRecurrenceFields />
            <SelectField label="Status" name="status" defaultValue="open" options={statusOptions} />
          </FormGrid>
          <TextareaField label="Description" name="description" className="mt-4" />
          <Button type="submit" className="mt-4">Add task</Button>
        </form>

        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <details key={task.id} className="rounded-lg border bg-background p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.due_date ? formatDate(task.due_date) : "No due date"}{task.due_time ? ` - ${task.due_time}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={task.priority === "urgent" ? "destructive" : "secondary"}>{task.priority}</Badge>
                      <Badge variant={task.status === "completed" ? "muted" : "outline"}>{task.status}</Badge>
                    </div>
                  </div>
                </summary>
                <form action={updateTaskAction} className="mt-4 border-t pt-4">
                  <HiddenRedirect to={`/tasks${view === "inbox" ? "" : `?view=${view}`}`} />
                  <input type="hidden" name="id" value={task.id} />
                  <FormGrid>
                    <TextField label="Title" name="title" defaultValue={task.title} required />
                    <SelectField label="Priority" name="priority" defaultValue={task.priority} options={priorityOptions} />
                    <TextField label="Due date" name="due_date" type="date" defaultValue={task.due_date} />
                    <TextField label="Due time" name="due_time" type="time" defaultValue={task.due_time} />
                    <SelectField label="RPG stat" name="rpg_category" defaultValue={task.rpg_category ?? ""} options={OPTIONAL_RPG_CATEGORY_OPTIONS} />
                    <SelectField label="Difficulty" name="rpg_difficulty" defaultValue={task.rpg_difficulty} options={RPG_DIFFICULTY_OPTIONS} />
                    <CalendarRecurrenceFields
                      recurrence={task.recurrence}
                      interval={task.recurrence_interval}
                      weekdays={task.recurrence_days_of_week}
                      endDate={task.recurrence_end_date}
                      count={task.recurrence_count}
                    />
                    <SelectField label="Status" name="status" defaultValue={task.status} options={statusOptions} />
                  </FormGrid>
                  <TextareaField label="Description" name="description" defaultValue={task.description} className="mt-4" />
                  <Button type="submit" className="mt-4">Save task</Button>
                </form>
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.status === "completed" ? (
                    <form action={reopenTaskAction}>
                      <HiddenRedirect to={`/tasks${view === "inbox" ? "" : `?view=${view}`}`} />
                      <input type="hidden" name="id" value={task.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <RotateCcw className="size-4" />
                        Reopen
                      </Button>
                    </form>
                  ) : (
                    <form action={completeTaskAction}>
                      <HiddenRedirect to={`/tasks${view === "inbox" ? "" : `?view=${view}`}`} />
                      <input type="hidden" name="id" value={task.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <Check className="size-4" />
                        Complete
                      </Button>
                    </form>
                  )}
                  <form action={deleteTaskAction}>
                    <HiddenRedirect to={`/tasks${view === "inbox" ? "" : `?view=${view}`}`} />
                    <input type="hidden" name="id" value={task.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="No tasks in this view" description="Use the form above or the global Add button to create one." />
        )}
      </CardContent>
    </Card>
  );
}
