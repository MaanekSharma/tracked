import { Check, Trash2 } from "lucide-react";
import { completeChoreAction, createChoreAction, deleteChoreAction, markBillPaidAction, updateChoreAction } from "@/features/actions";
import { isOverdue } from "@/lib/calculations";
import { formatDate, money, todayISO } from "@/lib/utils";
import { recurrenceLabels, type Bill, type Chore } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGrid, HiddenRedirect, SelectField, TextField, TextareaField } from "@/components/ui/form";

const recurrenceOptions = Object.entries(recurrenceLabels).map(([value, label]) => ({ value, label }));
const statusOptions = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export function ChoreManager({ chores }: { chores: Chore[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chores</CardTitle>
        <CardDescription>Recurring household responsibilities with next due dates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createChoreAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/home" />
          <FormGrid>
            <TextField label="Title" name="title" required />
            <TextField label="Room / Category" name="room" />
            <SelectField label="Frequency" name="frequency" defaultValue="weekly" options={recurrenceOptions} />
            <TextField label="Next due" name="next_due_date" type="date" defaultValue={todayISO()} />
            <SelectField label="Status" name="status" defaultValue="active" options={statusOptions} />
          </FormGrid>
          <TextareaField label="Description" name="description" className="mt-4" />
          <Button type="submit" className="mt-4">Add chore</Button>
        </form>

        {chores.length ? (
          <div className="space-y-3">
            {chores.map((chore) => (
              <details key={chore.id} className="rounded-lg border bg-background p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{chore.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {chore.next_due_date ? `Due ${formatDate(chore.next_due_date)}` : "No due date"}{chore.room ? ` - ${chore.room}` : ""}
                      </p>
                    </div>
                    <Badge variant={isOverdue(chore.next_due_date) ? "destructive" : "secondary"}>{chore.status}</Badge>
                  </div>
                </summary>
                <form action={updateChoreAction} className="mt-4 border-t pt-4">
                  <HiddenRedirect to="/home" />
                  <input type="hidden" name="id" value={chore.id} />
                  <FormGrid>
                    <TextField label="Title" name="title" defaultValue={chore.title} required />
                    <TextField label="Room / Category" name="room" defaultValue={chore.room} />
                    <SelectField label="Frequency" name="frequency" defaultValue={chore.frequency} options={recurrenceOptions} />
                    <TextField label="Next due" name="next_due_date" type="date" defaultValue={chore.next_due_date} />
                    <TextField label="Last completed" name="last_completed_date" type="date" defaultValue={chore.last_completed_date} />
                    <SelectField label="Status" name="status" defaultValue={chore.status} options={statusOptions} />
                  </FormGrid>
                  <TextareaField label="Description" name="description" defaultValue={chore.description} className="mt-4" />
                  <Button type="submit" className="mt-4">Save chore</Button>
                </form>
                <div className="mt-2 flex gap-2">
                  <form action={completeChoreAction}>
                    <HiddenRedirect to="/home" />
                    <input type="hidden" name="id" value={chore.id} />
                    <input type="hidden" name="frequency" value={chore.frequency} />
                    <Button type="submit" variant="outline" size="sm">
                      <Check className="size-4" />
                      Complete
                    </Button>
                  </form>
                  <form action={deleteChoreAction}>
                    <HiddenRedirect to="/home" />
                    <input type="hidden" name="id" value={chore.id} />
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
          <EmptyState title="No chores" description="Add recurring household tasks like cleaning, bedding, or floors." />
        )}
      </CardContent>
    </Card>
  );
}

export function HomeBills({ bills }: { bills: Bill[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bills requiring attention</CardTitle>
        <CardDescription>Active bills from Money are shown here without duplicating records.</CardDescription>
      </CardHeader>
      <CardContent>
        {bills.length ? (
          <div className="space-y-3">
            {bills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-4">
                <div>
                  <p className="font-semibold">{bill.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {money(bill.amount, true)} due {formatDate(bill.next_due_date)}
                  </p>
                </div>
                <form action={markBillPaidAction}>
                  <HiddenRedirect to="/home" />
                  <input type="hidden" name="id" value={bill.id} />
                  <Button type="submit" variant="outline" size="sm">Mark paid</Button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No active bills" description="Bills added in Money will appear here while they require attention." />
        )}
      </CardContent>
    </Card>
  );
}
