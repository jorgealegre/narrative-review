"use client";

import { CoverageResult, AnalysisMetrics } from "@/lib/types";
import { ShieldCheck, AlertTriangle, Coins } from "lucide-react";
import { useFancyMode } from "@/hooks/useFancyMode";

const MODEL_LABELS: Record<string, string> = {
  "claude-3-5-haiku-20241022": "Haiku",
  "claude-sonnet-4-20250514": "Sonnet",
  "claude-opus-4-20250514": "Opus",
};

interface ProgressTrackerProps {
  reviewedCount: number;
  totalChapters: number;
  coverage: CoverageResult;
  metrics?: AnalysisMetrics;
  prTitle: string;
  prUrl: string;
}

export function ProgressTracker({
  reviewedCount,
  totalChapters,
  coverage,
  metrics,
  prTitle,
  prUrl,
}: ProgressTrackerProps) {
  const { fancy } = useFancyMode();
  const percentage =
    totalChapters > 0 ? Math.round((reviewedCount / totalChapters) * 100) : 0;
  const allReviewed = reviewedCount === totalChapters && totalChapters > 0;

  return (
    <div className={`border-b sticky top-0 z-20 ${
      fancy
        ? "border-indigo-500/10 bg-zinc-950/70 backdrop-blur-xl"
        : "border-zinc-800 bg-zinc-950/50 backdrop-blur-sm"
    }`}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1 mr-4">
            {prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-semibold text-zinc-100 hover:text-indigo-400 transition-colors truncate block"
              >
                {prTitle}
              </a>
            ) : (
              <span className="text-lg font-semibold text-zinc-100 truncate block">
                {prTitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {metrics && (
              <div className="flex items-center gap-1.5" title={`${metrics.inputTokens.toLocaleString()} input + ${metrics.outputTokens.toLocaleString()} output tokens · ${(metrics.durationMs / 1000).toFixed(1)}s`}>
                <Coins className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs font-mono text-zinc-500">
                  {MODEL_LABELS[metrics.model] || "Claude"} · ${metrics.cost.toFixed(3)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {coverage.isComplete ? (
                <ShieldCheck className="w-4 h-4 text-green-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span
                className={`text-xs font-mono ${
                  coverage.isComplete ? "text-green-400" : "text-amber-400"
                }`}
              >
                {coverage.coveredHunks}/{coverage.totalHunks} hunks
              </span>
            </div>
            <span className="text-sm text-zinc-400">
              {reviewedCount}/{totalChapters}
            </span>
            <span
              className={`text-sm font-bold ${
                allReviewed ? "text-green-400" : "text-zinc-300"
              }`}
            >
              {percentage}%
            </span>
          </div>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allReviewed ? "bg-green-500" : "bg-indigo-500"
            } ${fancy && !allReviewed ? "fancy-progress-glow" : ""}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
