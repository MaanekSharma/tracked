"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme | ((current: Theme) => Theme)) => void;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: Theme[];
};

const STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "tracked-theme-change";
const DEFAULT_THEME: Theme = "dark";
const DEFAULT_RESOLVED_THEME: ResolvedTheme = "dark";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const THEMES: Theme[] = ["dark", "light", "system"];

const fallbackThemeContext: ThemeContextValue = {
  theme: DEFAULT_THEME,
  setTheme: () => {},
  resolvedTheme: DEFAULT_RESOLVED_THEME,
  systemTheme: DEFAULT_RESOLVED_THEME,
  themes: THEMES,
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function resolvedSystemTheme(media: MediaQueryList | MediaQueryListEvent): ResolvedTheme {
  return media.matches ? "dark" : "light";
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return DEFAULT_RESOLVED_THEME;
  return resolvedSystemTheme(window.matchMedia(SYSTEM_THEME_QUERY));
}

function subscribeToTheme(callback: () => void) {
  const handleThemeChange = () => callback();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

function subscribeToSystemTheme(callback: () => void) {
  const media = window.matchMedia(SYSTEM_THEME_QUERY);
  const handleSystemThemeChange = () => callback();

  media.addEventListener("change", handleSystemThemeChange);

  return () => {
    media.removeEventListener("change", handleSystemThemeChange);
  };
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    window.setTimeout(() => {
      style.remove();
    }, 1);
  };
}

function applyTheme(theme: Theme, systemTheme: ResolvedTheme) {
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const restoreTransitions = disableTransitionsTemporarily();
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
  restoreTransitions();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, readStoredTheme, () => DEFAULT_THEME);
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, readSystemTheme, () => DEFAULT_RESOLVED_THEME);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    applyTheme(theme, systemTheme);
  }, [systemTheme, theme]);

  const setTheme = useCallback<ThemeContextValue["setTheme"]>((value) => {
    const next = typeof value === "function" ? value(readStoredTheme()) : value;
    if (!isTheme(next)) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const context = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: THEMES,
    }),
    [resolvedTheme, setTheme, systemTheme, theme],
  );

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext) ?? fallbackThemeContext;
}
