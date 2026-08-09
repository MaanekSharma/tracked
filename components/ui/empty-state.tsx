import { CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center", className)}>
      <CircleDashed className="mb-3 size-6 text-muted-foreground" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
