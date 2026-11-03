import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;
type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

// Keep the existing preference key when switching from next-themes.
const STORAGE_KEY = "theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch { /* Theme switching still works when storage is unavailable. */ }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(savedTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light",
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const updateSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) updateTheme(savedTheme());
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  // Apply the theme before paint; a Vite SPA does not need an SSR bootstrap script.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((value: Theme) => {
    updateTheme(value);
    try { localStorage.setItem(STORAGE_KEY, value); }
    catch { /* The in-memory preference remains usable. */ }
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
