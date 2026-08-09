import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const copy: Record<string, string> = {
  saved: "Saved.",
  deleted: "Deleted.",
  signedout: "Signed out.",
  updated: "Updated.",
};

export function PageNotice({
  notice,
  error,
}: {
  notice?: string | string[];
  error?: string | string[];
}) {
  const noticeValue = Array.isArray(notice) ? notice[0] : notice;
  const errorValue = Array.isArray(error) ? error[0] : error;

  if (!noticeValue && !errorValue) return null;

  const isError = Boolean(errorValue);
  const message = isError ? decodeURIComponent(errorValue ?? "Something went wrong.") : copy[noticeValue ?? ""] ?? "Done.";
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
        isError ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-primary",
      )}
      role="status"
    >
      <Icon className="size-4" />
      <span>{message}</span>
    </div>
  );
}
