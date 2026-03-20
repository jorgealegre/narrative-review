"use client";

import { useFancyMode } from "@/hooks/useFancyMode";
import { Sparkles, MonitorDot } from "lucide-react";

export function FancyModeToggle() {
  const { fancy, toggle } = useFancyMode();

  return (
    <button
      onClick={toggle}
      className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition-all duration-300 group backdrop-blur-md ${
        fancy
          ? "bg-accent-muted border-accent/30"
          : "bg-bg-tertiary/80 border-bd-primary/50"
      }`}
      title={fancy ? "Switch to clean UI" : "Switch to fancy UI"}
    >
      {fancy ? (
        <>
          <Sparkles className="w-3.5 h-3.5 text-accent-text" />
          <span className="text-accent-text hidden group-hover:inline transition-all">
            Fancy
          </span>
        </>
      ) : (
        <>
          <MonitorDot className="w-3.5 h-3.5 text-t-tertiary" />
          <span className="text-t-tertiary hidden group-hover:inline transition-all">
            Clean
          </span>
        </>
      )}
    </button>
  );
}
