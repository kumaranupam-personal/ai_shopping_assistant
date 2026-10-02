import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "theme"; // also read by the inline script in index.html
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system"; // storage blocked: follow the system
  }
}

/** The chosen theme, saved in localStorage and applied as <html data-theme>. "system" tracks OS changes live. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);

  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && systemDark.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    if (theme !== "system") return;
    systemDark.addEventListener("change", apply);
    return () => systemDark.removeEventListener("change", apply);
  }, [theme]);

  return [theme, setTheme] as const;
}
