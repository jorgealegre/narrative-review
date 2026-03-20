"use client";

import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-bg-tertiary border border-bd-primary text-t-tertiary hover:text-t-primary transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
