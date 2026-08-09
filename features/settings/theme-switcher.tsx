"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const items = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

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
