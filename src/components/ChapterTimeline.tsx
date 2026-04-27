"use client";

import { Chapter, NarrativeReview } from "@/lib/types";
import { CheckCircle2, Circle, AlertTriangle, FileCode, BookOpen } from "lucide-react";
import { InlineMarkdown } from "./InlineMarkdown";

interface ChapterTimelineProps {
  review: NarrativeReview;
  chapters: Chapter[];
  activeChapterId: string | null;
  isChapterReviewed: (id: string) => boolean;
  onSelectChapter: (id: string) => void;
  onSelectOverview: () => void;
  overviewActive: boolean;
}

export function ChapterTimeline({
  review,
  chapters,
  activeChapterId,
  isChapterReviewed,
  onSelectChapter,
  onSelectOverview,
  overviewActive,
}: ChapterTimelineProps) {
  return (
    <nav className="relative">
      {/* Connecting line */}
      <div className="absolute left-[21px] top-4 bottom-4 w-px bg-bg-tertiary" />

      <div className="space-y-0.5 relative">
        {/* Overview / Chapter 0 */}
        <button
          onClick={onSelectOverview}
          className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-all text-sm relative ${
            overviewActive
              ? "bg-bg-tertiary/80 text-t-primary"
              : "text-t-tertiary hover:bg-bg-tertiary/40 hover:text-t-secondary"
          }`}
        >
          <div className="flex-shrink-0 mt-0.5 z-10 bg-bg-primary rounded-full">
            {overviewActive ? (
              <BookOpen className="w-4 h-4 text-accent-text" />
            ) : (
              <BookOpen className="w-4 h-4 text-t-tertiary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono flex-shrink-0 text-t-tertiary">0</span>
              <span className="font-medium leading-tight">Overview</span>
            </div>
            <p className="text-xs text-t-tertiary leading-relaxed mt-1 line-clamp-2">
              <InlineMarkdown>{review.rootCause}</InlineMarkdown>
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-t-tertiary">
              <span>{review.prInfo.changedFiles} files</span>
              <span className="text-green-600">+{review.prInfo.additions}</span>
              <span className="text-red-600">−{review.prInfo.deletions}</span>
            </div>
          </div>
        </button>

        {/* Chapters */}
        {chapters.map((chapter, i) => {
          const isActive = chapter.id === activeChapterId && !overviewActive;
          const reviewed = isChapterReviewed(chapter.id);
          const isUncategorized = chapter.id === "uncategorized";
          const uniqueFiles = [...new Set(chapter.hunks.map((h) => h.file))];
          // Strip backticks so truncation doesn't sever an inline-code span.
          const narrativePreview = chapter.narrative.replace(/`/g, "").slice(0, 80);

          return (
            <button
              key={chapter.id}
              onClick={() => onSelectChapter(chapter.id)}
              className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-all text-sm relative ${
                isActive
                  ? "bg-bg-tertiary/80 text-t-primary"
                  : "text-t-tertiary hover:bg-bg-tertiary/40 hover:text-t-secondary"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5 z-10 bg-bg-primary rounded-full">
                {reviewed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : isUncategorized ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : isActive ? (
                  <Circle className="w-4 h-4 text-accent-text fill-accent-text/20" />
                ) : (
                  <Circle className="w-4 h-4 text-t-tertiary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`text-xs font-mono flex-shrink-0 ${
                      isUncategorized ? "text-amber-500" : "text-t-tertiary"
                    }`}
                  >
                    {isUncategorized ? "!" : i + 1}
                  </span>
                  <span className="font-medium leading-tight line-clamp-2">
                    {chapter.title}
                  </span>
                </div>
                <p className="text-xs text-t-tertiary leading-relaxed mt-1 line-clamp-2">
                  {narrativePreview}
                  {chapter.narrative.length > 80 ? "..." : ""}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {uniqueFiles.slice(0, 3).map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 text-[10px] bg-bg-tertiary/60 text-t-tertiary rounded px-1.5 py-0.5"
                    >
                      <FileCode className="w-2.5 h-2.5" />
                      {f.split("/").pop()}
                    </span>
                  ))}
                  {uniqueFiles.length > 3 && (
                    <span className="text-[10px] text-t-tertiary px-1 py-0.5">
                      +{uniqueFiles.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
