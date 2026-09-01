import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FormGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  step,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: React.HTMLInputTypeAttribute;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
      />
    </Field>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
  className,
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  required?: boolean;
  className?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <Field label={label} className={className}>
      <select
        name={name}
        defaultValue={value === undefined ? defaultValue ?? "" : undefined}
        value={value}
        onChange={onChange}
        required={required}
        className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-primary" />
      <span>{label}</span>
    </label>
  );
}

export function HiddenRedirect({ to }: { to: string }) {
  return <input type="hidden" name="redirectTo" value={to} />;
}
