"use client";

import { useState, useEffect, useCallback } from "react";
import { Chapter, NarrativeReview } from "@/lib/types";
import { DiffView } from "./DiffView";
import {
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";

interface WalkthroughModeProps {
  review: NarrativeReview;
  isChapterReviewed: (id: string) => boolean;
  onToggleReview: (id: string) => void;
  onExit: () => void;
  startChapterId?: string;
}

export function WalkthroughMode({
  review,
  isChapterReviewed,
  onToggleReview,
  onExit,
  startChapterId,
}: WalkthroughModeProps) {
  const startIndex = startChapterId
    ? review.chapters.findIndex((c) => c.id === startChapterId)
    : 0;
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, startIndex));
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [showDiff, setShowDiff] = useState(false);

  const chapter = review.chapters[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === review.chapters.length - 1;
  const reviewed = isChapterReviewed(chapter.id);

  const goTo = useCallback(
    (index: number, dir: "left" | "right") => {
      if (index < 0 || index >= review.chapters.length) return;
      setDirection(dir);
      setTransitioning(true);
      setShowDiff(false);
      setTimeout(() => {
        setCurrentIndex(index);
        setTransitioning(false);
      }, 300);
    },
    [review.chapters.length]
  );

  const goNext = useCallback(() => goTo(currentIndex + 1, "right"), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1, "left"), [currentIndex, goTo]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowRight":
        case "j":
          e.preventDefault();
          if (!isLast) goNext();
          break;
        case "ArrowLeft":
        case "k":
          e.preventDefault();
          if (!isFirst) goPrev();
          break;
        case " ":
          e.preventDefault();
          onToggleReview(chapter.id);
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
        case "d":
          e.preventDefault();
          setShowDiff((s) => !s);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chapter.id, isFirst, isLast, goNext, goPrev, onExit, onToggleReview]);

  // Auto-reveal diff after a brief pause
  useEffect(() => {
    const timer = setTimeout(() => setShowDiff(true), 800);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500 font-mono">
            {currentIndex + 1} / {review.chapters.length}
          </span>
          <span className="text-sm text-zinc-600">·</span>
          <span className="text-sm text-zinc-400">{review.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleReview(chapter.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
              reviewed
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
            }`}
          >
            {reviewed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
            {reviewed ? "Reviewed" : "Mark reviewed"}
          </button>
          <button
            onClick={onExit}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={`max-w-4xl mx-auto px-8 py-12 transition-all duration-300 ${
            transitioning
              ? direction === "right"
                ? "opacity-0 translate-x-8"
                : "opacity-0 -translate-x-8"
              : "opacity-100 translate-x-0"
          }`}
        >
          {/* Chapter number + title */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-6xl font-bold text-zinc-800 font-mono">
                {currentIndex + 1}
              </span>
            </div>
            <h2 className="text-3xl font-bold text-zinc-100 mb-2 leading-tight">
              {chapter.title}
            </h2>
            {/* Transition text */}
            {chapter.connectionToPrevious && (
              <p className="text-base text-zinc-500 mt-3 pl-4 border-l-2 border-zinc-700 italic">
                {chapter.connectionToPrevious}
              </p>
            )}
          </div>

          {/* Narrative */}
          <p className="text-lg text-zinc-300 leading-relaxed mb-8 max-w-3xl">
            {chapter.narrative}
          </p>

          {/* Safety notes */}
          {chapter.safetyNotes && chapter.safetyNotes.length > 0 && (
            <div className="mb-8 space-y-2">
              {chapter.safetyNotes.map((note, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm bg-green-500/5 border border-green-500/10 rounded-lg px-4 py-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-green-300">{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Code diffs with reveal animation */}
          <div
            className={`space-y-3 transition-all duration-500 ${
              showDiff ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {chapter.hunks.map((hunk, i) => (
              <div
                key={`${hunk.file}-${hunk.hunkIndex}-${i}`}
                className="transition-all duration-300"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <DiffView
                  diffContent={hunk.diffContent}
                  fileName={hunk.file}
                  annotation={hunk.annotation}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-zinc-800/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              isFirst
                ? "text-zinc-700 cursor-not-allowed"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {review.chapters.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() =>
                  goTo(i, i > currentIndex ? "right" : "left")
                }
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? "w-6 h-2 bg-indigo-500"
                    : isChapterReviewed(ch.id)
                    ? "w-2 h-2 bg-green-500"
                    : "w-2 h-2 bg-zinc-700 hover:bg-zinc-600"
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Finish
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
