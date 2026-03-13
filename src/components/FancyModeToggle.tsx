"use client";

import { useFancyMode } from "@/hooks/useFancyMode";
import { Sparkles, MonitorDot } from "lucide-react";

export function FancyModeToggle() {
  const { fancy, toggle } = useFancyMode();

  return (
    <button
      onClick={toggle}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition-all duration-300 group"
      style={{
        background: fancy
          ? "rgba(99, 102, 241, 0.1)"
          : "rgba(39, 39, 42, 0.8)",
        borderColor: fancy
          ? "rgba(99, 102, 241, 0.3)"
          : "rgba(63, 63, 70, 0.5)",
        backdropFilter: "blur(8px)",
      }}
      title={fancy ? "Switch to clean UI" : "Switch to fancy UI"}
    >
      {fancy ? (
        <>
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-indigo-300 hidden group-hover:inline transition-all">
            Fancy
          </span>
        </>
      ) : (
        <>
          <MonitorDot className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400 hidden group-hover:inline transition-all">
            Clean
          </span>
        </>
      )}
    </button>
  );
}
