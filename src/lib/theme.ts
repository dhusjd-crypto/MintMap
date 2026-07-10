import { useEffect, useState } from "react";

const KEY = "mintmap.theme";
export type Theme = "light" | "dark" | "mint";
const ORDER: Theme[] = ["light", "mint", "dark"];

function read(): Theme {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(KEY);
  if (v === "dark" || v === "light" || v === "mint") return v;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(t: Theme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", t === "dark");
  el.classList.toggle("mint", t === "mint");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => read());

  useEffect(() => {
    apply(theme);
    if (typeof window !== "undefined") localStorage.setItem(KEY, theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]),
    set: setTheme,
  };
}

export function initTheme() {
  apply(read());
}
