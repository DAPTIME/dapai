import { useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light";

const KEY = "dap.theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(KEY);
  return v === "light" ? "light" : "dark";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
  root.style.colorScheme = t;
}

/** Apply persisted theme as early as possible on the client. */
export function initThemeEarly() {
  if (typeof window === "undefined") return;
  applyTheme(readTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Listen for changes from other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  return { theme, setTheme };
}
