"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/utils";

export function BudgetMiniChart({
  data,
}: {
  data: { name: string; spent: number; budget: number }[];
}) {
  if (!data.length) return null;

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
            }}
            formatter={(value, name) => [money(Number(value), true), name === "spent" ? "Spent" : "Budget"]}
          />
          <Bar dataKey="budget" fill="var(--muted)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
