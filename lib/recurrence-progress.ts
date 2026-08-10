export function hasFutureRecurrence({
  nextDate,
  completedCount,
  recurrenceCount,
  recurrenceEndDate,
}: {
  nextDate: string | null;
  completedCount: number;
  recurrenceCount: number | null;
  recurrenceEndDate: string | null;
}) {
  if (!nextDate) return false;
  if (recurrenceCount !== null && completedCount >= recurrenceCount) return false;
  if (recurrenceEndDate !== null && nextDate > recurrenceEndDate) return false;
  return true;
}
