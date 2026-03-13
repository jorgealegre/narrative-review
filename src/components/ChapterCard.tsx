"use client";

import { Chapter } from "@/lib/types";
import { DiffView } from "./DiffView";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";
import { useState } from "react";

interface ChapterCardProps {
  chapter: Chapter;
  index: number;
  isReviewed: boolean;
  isActive: boolean;
  onToggleReview: () => void;
  onActivate: () => void;
  prUrl?: string;
}

export function ChapterCard({
  chapter,
  index,
  isReviewed,
  isActive,
  onToggleReview,
  onActivate,
  prUrl,
}: ChapterCardProps) {
  const [expanded, setExpanded] = useState(true);
  const isUncategorized = chapter.id === "uncategorized";

  return (
    <div
      id={`chapter-${chapter.id}`}
      className={`rounded-xl border transition-all duration-200 ${
        isActive
          ? "border-indigo-500/50 shadow-lg shadow-indigo-500/10"
          : "border-zinc-800"
      } ${isUncategorized ? "border-amber-500/30" : ""} ${
        isReviewed ? "opacity-75" : ""
      }`}
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
            <p className="text-sm text-zinc-300 leading-relaxed mb-4">
              {chapter.narrative}
            </p>

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
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            ) : (
              <Circle className="w-6 h-6 text-zinc-600 hover:text-zinc-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
