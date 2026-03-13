"use client";

import { Chapter, PRInfo, DiffSettings } from "@/lib/types";
import { DiffView } from "./DiffView";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
  MessageCircle,
} from "lucide-react";
import { useState } from "react";
import { useFancyMode } from "@/hooks/useFancyMode";

interface ChapterCardProps {
  chapter: Chapter;
  index: number;
  isReviewed: boolean;
  isActive: boolean;
  onToggleReview: () => void;
  onActivate: () => void;
  prUrl?: string;
  prInfo?: PRInfo;
  diffSettings?: DiffSettings;
  onAskAbout?: (question: string) => void;
}

export function ChapterCard({
  chapter,
  index,
  isReviewed,
  isActive,
  onToggleReview,
  onActivate,
  prUrl,
  prInfo,
  diffSettings,
  onAskAbout,
}: ChapterCardProps) {
  const { fancy } = useFancyMode();
  const [expanded, setExpanded] = useState(true);
  const isUncategorized = chapter.id === "uncategorized";

  return (
    <div
      id={`chapter-${chapter.id}`}
      className={`rounded-xl border transition-all duration-200 animate-fade-in-up ${
        fancy ? "fancy-chapter-card" : ""
      } ${
        isActive
          ? fancy
            ? "border-indigo-500/40 shadow-lg shadow-indigo-500/10 bg-zinc-900/30"
            : "border-indigo-500/50 shadow-lg shadow-indigo-500/10"
          : fancy
            ? "border-zinc-800/60 bg-zinc-950/50"
            : "border-zinc-800"
      } ${isUncategorized ? "border-amber-500/30" : ""} ${
        isReviewed ? "opacity-75" : ""
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={onActivate}
    >
      {/* Chapter header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Chapter number */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isUncategorized
                ? "bg-amber-500/20 text-amber-400"
                : isReviewed
                ? "bg-green-500/20 text-green-400"
                : "bg-indigo-500/20 text-indigo-400"
            }`}
          >
            {isUncategorized ? "!" : index + 1}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-zinc-100">
                {chapter.title}
              </h3>
              <span className="text-xs text-zinc-500 flex-shrink-0">
                {chapter.hunks.length} change{chapter.hunks.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Connection to previous */}
            {chapter.connectionToPrevious && (
              <p className="text-sm text-zinc-500 mb-3 pl-3 border-l-2 border-zinc-700">
                {chapter.connectionToPrevious}
              </p>
            )}

            {/* Narrative */}
            <div className="group/narrative mb-4">
              <p className="text-sm text-zinc-300 leading-relaxed">
                {chapter.narrative}
              </p>
              {onAskAbout && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAskAbout(
                      `Regarding chapter "${chapter.title}": ${chapter.narrative}\n\nCan you expand on this explanation? What exactly is happening here and why?`
                    );
                  }}
                  className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 hover:text-indigo-400 transition-colors opacity-0 group-hover/narrative:opacity-100"
                >
                  <MessageCircle className="w-3 h-3" />
                  Ask about this
                </button>
              )}
            </div>

            {/* Safety notes */}
            {chapter.safetyNotes && chapter.safetyNotes.length > 0 && (
              <div className="mb-4 space-y-1">
                {chapter.safetyNotes.map((note, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm"
                  >
                    {isUncategorized ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        isUncategorized ? "text-amber-300" : "text-green-300"
                      }
                    >
                      {note}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Diff toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {expanded ? "Hide" : "Show"} code changes
            </button>

            {/* Diff hunks */}
            {expanded && (
              <div className="space-y-2">
                {chapter.hunks.map((hunk, i) => (
                  <DiffView
                    key={`${hunk.file}-${hunk.hunkIndex}-${i}`}
                    diffContent={hunk.diffContent}
                    fileName={hunk.file}
                    annotation={hunk.annotation}
                    githubUrl={
                      prUrl ? `${prUrl}/files#diff-${encodeURIComponent(hunk.file)}` : undefined
                    }
                    prInfo={prInfo}
                    settings={diffSettings}
                    onAskAbout={onAskAbout}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Review toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleReview();
            }}
            className="flex-shrink-0 p-1 hover:bg-zinc-800 rounded-lg transition-colors"
            title={isReviewed ? "Mark as unreviewed" : "Mark as reviewed"}
          >
            {isReviewed ? (
              <CheckCircle2 className="w-6 h-6 text-green-400 animate-scale-check" />
            ) : (
              <Circle className="w-6 h-6 text-zinc-600 hover:text-zinc-400 transition-colors" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
