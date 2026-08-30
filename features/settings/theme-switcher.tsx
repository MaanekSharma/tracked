"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/components/providers/theme-provider";

const items = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] satisfies { value: Theme; label: string; icon: typeof Moon }[];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.value}
            type="button"
            variant={theme === item.value ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme(item.value)}
          >
            <Icon className="size-4" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
