import { type ClassValue, clsx } from "clsx";
import { format, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export const cadPreciseFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const percentFormatter = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function money(value: number | string | null | undefined, precise = false) {
  const numeric = Number(value ?? 0);
  return precise ? cadPreciseFormatter.format(numeric) : cadFormatter.format(numeric);
}

export function percentage(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) return "0%";
  return percentFormatter.format((value ?? 0) / 100);
}

export function formatDate(value: string | Date | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) return "No date";
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, pattern);
}

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function monthStartISO(date = new Date()) {
  return format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd");
}

export function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
