"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { NarrativeReview, DiffSettings, DiffViewMode } from "@/lib/types";
import { DiffView } from "./DiffView";
import {
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  Circle,
  ArrowRight,
  GitPullRequest,
  User,
  FileCode,
  AlignJustify,
  Rows3,
  Columns2,
  EyeOff,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface WalkthroughModeProps {
  review: NarrativeReview;
  isChapterReviewed: (id: string) => boolean;
  onToggleReview: (id: string) => void;
  onExit: () => void;
  startChapterId?: string;
  fileContents?: Record<string, string>;
}

export function WalkthroughMode({
  review,
  isChapterReviewed,
  onToggleReview,
  onExit,
  startChapterId,
  fileContents,
}: WalkthroughModeProps) {
  // -1 = intro slide, 0..n = chapter slides
  const startIndex = startChapterId
    ? review.chapters.findIndex((c) => c.id === startChapterId)
    : -1;
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [showDiff, setShowDiff] = useState(false);
  const [diffSettings, setDiffSettings] = useState<DiffSettings>({
    hideWhitespace: false,
    viewMode: "unified",
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isIntro = currentIndex === -1;
  const chapter = isIntro ? null : review.chapters[currentIndex];
  const isFirst = currentIndex === -1;
  const isLast = currentIndex === review.chapters.length - 1;
  const reviewed = chapter ? isChapterReviewed(chapter.id) : false;
  const totalSlides = review.chapters.length + 1; // intro + chapters
  const slideNumber = currentIndex + 2; // 1-indexed, intro is 1

  const uniqueFiles = useMemo(() => {
    if (!chapter) return [];
    return [...new Set(chapter.hunks.map((h) => h.file))];
  }, [chapter]);

  const prStats = useMemo(() => {
    const { prInfo } = review;
    return {
      files: prInfo.changedFiles,
      additions: prInfo.additions,
      deletions: prInfo.deletions,
      author: prInfo.author,
    };
  }, [review]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Map<number, number>>(new Map());

  const goTo = useCallback(
    (index: number, dir: "left" | "right") => {
      if (index < -1 || index >= review.chapters.length) return;
      if (scrollRef.current) {
        scrollPositions.current.set(currentIndex, scrollRef.current.scrollTop);
      }
      setDirection(dir);
      setTransitioning(true);
      setShowDiff(false);
      setTimeout(() => {
        setCurrentIndex(index);
        setTransitioning(false);
        if (scrollRef.current) {
          const saved = scrollPositions.current.get(index);
          scrollRef.current.scrollTop = saved ?? 0;
        }
      }, 250);
    },
    [review.chapters.length, currentIndex]
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
          if (chapter) onToggleReview(chapter.id);
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
        case "d":
          e.preventDefault();
          if (!isIntro) setShowDiff((s) => !s);
          break;
        case "w":
          e.preventDefault();
          setDiffSettings((s) => ({ ...s, hideWhitespace: !s.hideWhitespace }));
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chapter, isFirst, isLast, isIntro, goNext, goPrev, onExit, onToggleReview]);

  useEffect(() => {
    if (isIntro) return;
    const timer = setTimeout(() => setShowDiff(true), 600);
    return () => clearTimeout(timer);
  }, [currentIndex, isIntro]);

  return (
    <div className="fixed inset-0 bg-bg-primary z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-bd-primary/50">
        <div className="flex items-center gap-3">
          <span className="text-sm text-t-tertiary font-mono">
            {slideNumber} / {totalSlides}
          </span>
          <span className="text-sm text-t-tertiary">·</span>
          <span className="text-sm text-t-tertiary truncate max-w-md">{review.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Diff settings (only on chapter slides) */}
          {!isIntro && (
            <div className="flex items-center gap-1 mr-2">
              <div className="flex items-center bg-bg-secondary border border-bd-primary rounded-lg p-0.5">
                {([
                  { mode: "unified" as DiffViewMode, icon: AlignJustify, label: "Unified" },
                  { mode: "compact" as DiffViewMode, icon: Rows3, label: "Compact" },
                  { mode: "split" as DiffViewMode, icon: Columns2, label: "Split" },
                ] as const).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setDiffSettings((s) => ({ ...s, viewMode: mode }))}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                      diffSettings.viewMode === mode
                        ? "bg-bg-tertiary text-t-primary"
                        : "text-t-tertiary hover:text-t-secondary"
                    }`}
                    title={label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDiffSettings((s) => ({ ...s, hideWhitespace: !s.hideWhitespace }))}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
                  diffSettings.hideWhitespace
                    ? "bg-accent-muted border-accent/30 text-accent-text"
                    : "bg-bg-secondary border-bd-primary text-t-tertiary hover:text-t-secondary"
                }`}
                title={diffSettings.hideWhitespace ? "Show whitespace" : "Hide whitespace (w)"}
              >
                {diffSettings.hideWhitespace ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
          {!isIntro && chapter && (
            <button
              onClick={() => onToggleReview(chapter.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                reviewed
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-bg-tertiary text-t-tertiary border border-bd-primary hover:border-t-tertiary"
              }`}
            >
              {reviewed ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
              {reviewed ? "Reviewed" : "Mark reviewed"}
            </button>
          )}
          <button
            onClick={onExit}
            className="p-2 text-t-tertiary hover:text-t-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto walkthrough-scroll">
        <div
          className={`mx-auto px-8 py-12 transition-all duration-250 ${
            transitioning
              ? direction === "right"
                ? "opacity-0 translate-x-8"
                : "opacity-0 -translate-x-8"
              : "opacity-100 translate-x-0"
          }`}
        >
          {isIntro ? (
            /* ── Intro / Landing slide ── */
            <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-accent-muted border border-accent/20 flex items-center justify-center mb-6">
                <GitPullRequest className="w-8 h-8 text-accent-text" />
              </div>

              <h1 className="text-4xl font-bold text-t-primary mb-4 leading-tight max-w-2xl">
                {review.title}
              </h1>

              {review.prInfo.author && (
                <div className="flex items-center gap-2 text-t-tertiary mb-6">
                  <User className="w-4 h-4" />
                  <span className="text-sm">by {review.prInfo.author}</span>
                </div>
              )}

              <p className="text-lg text-t-secondary leading-relaxed max-w-2xl mb-8">
                {review.summary}
              </p>

              <div className="bg-bg-secondary/60 border border-bd-primary rounded-xl px-6 py-4 mb-8 max-w-lg w-full">
                <h3 className="text-xs text-t-tertiary uppercase tracking-wider font-semibold mb-2">
                  Root Cause
                </h3>
                <p className="text-t-primary">{review.rootCause}</p>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-6 text-sm text-t-tertiary mb-10">
                <div className="flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-t-tertiary" />
                  <span>{prStats.files} files</span>
                </div>
                <span className="text-green-400">+{prStats.additions}</span>
                <span className="text-red-400">−{prStats.deletions}</span>
                <span>{review.chapters.length} chapters</span>
              </div>

              {/* Chapter overview list */}
              <div className="w-full max-w-lg text-left">
                <h3 className="text-xs text-t-tertiary uppercase tracking-wider font-semibold mb-3">
                  Journey Outline
                </h3>
                <div className="space-y-2">
                  {review.chapters.map((ch, i) => (
                    <button
                      key={ch.id}
                      onClick={() => goTo(i, "right")}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-bg-secondary/60 transition-colors group text-left"
                    >
                      <span className="text-xs font-mono text-t-tertiary mt-0.5 w-5 text-right flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-t-secondary group-hover:text-t-primary transition-colors">
                          {ch.title}
                        </p>
                        <p className="text-xs text-t-tertiary truncate mt-0.5">
                          {[...new Set(ch.hunks.map((h) => h.file))].join(", ")}
                        </p>
                      </div>
                      {isChapterReviewed(ch.id) && (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : chapter ? (
            /* ── Chapter slide — two-column layout ── */
            <div className="flex">
              {/* Left: sticky narrative sidebar */}
              <div className={`flex-shrink-0 sticky top-0 self-start border-r border-bd-primary/50 transition-all duration-300 ${
                sidebarCollapsed ? "w-12" : "w-[380px] pr-6"
              }`}>
                {/* Collapsed state */}
                <div className={`flex flex-col items-center pt-2 transition-opacity duration-200 ${
                  sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
                }`}>
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="p-2 text-t-tertiary hover:text-t-primary hover:bg-bg-tertiary rounded-lg transition-colors"
                    title="Show chapter info"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono text-t-tertiary mt-2">{currentIndex + 1}</span>
                </div>

                {/* Expanded state */}
                <div className={`transition-opacity duration-200 ${
                  sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-6xl font-bold text-bg-tertiary font-mono">
                      {currentIndex + 1}
                    </span>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="p-1.5 text-t-tertiary hover:text-t-secondary rounded transition-colors mt-2"
                      title="Collapse sidebar"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>
                  <h2 className="text-2xl font-bold text-t-primary mb-2 leading-tight">
                    {chapter.title}
                  </h2>
                  {chapter.connectionToPrevious && (
                    <p className="text-sm text-t-tertiary mt-3 pl-4 border-l-2 border-bd-primary italic">
                      {chapter.connectionToPrevious}
                    </p>
                  )}

                  <p className="text-sm text-t-secondary leading-relaxed mt-4 mb-5">
                    {chapter.narrative}
                  </p>

                  {/* Files touched */}
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {uniqueFiles.map((f) => (
                      <span
                        key={f}
                        className="text-xs font-mono bg-bg-secondary border border-bd-primary rounded px-2 py-0.5 text-t-tertiary"
                      >
                        {f.split("/").pop()}
                      </span>
                    ))}
                  </div>

                  {chapter.safetyNotes && chapter.safetyNotes.length > 0 && (
                    <div className="space-y-2">
                      {chapter.safetyNotes.map((note, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-sm bg-green-500/5 border border-green-500/10 rounded-lg px-3 py-2"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-green-300">{note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: code diffs */}
              <div
                className={`flex-1 min-w-0 pl-6 space-y-3 transition-all duration-500 ${
                  showDiff ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                {chapter.hunks.map((hunk, i) => (
                  <div
                    key={`${hunk.file}-${hunk.hunkIndex}-${i}`}
                    className="transition-all duration-300"
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <DiffView
                      diffContent={hunk.diffContent}
                      fileName={hunk.file}
                      annotation={hunk.annotation}
                      settings={diffSettings}
                      fileContent={fileContents?.[hunk.file]}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-bd-primary/50 px-6 py-3">
        <div className="mx-auto flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              isFirst
                ? "text-bd-primary cursor-not-allowed"
                : "text-t-tertiary hover:text-t-primary hover:bg-bg-tertiary"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            {currentIndex === 0 ? "Overview" : "Previous"}
          </button>

          {/* Progress dots — intro dot + chapter dots */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goTo(-1, "left")}
              className={`rounded-full transition-all ${
                isIntro ? "w-6 h-2 bg-accent" : "w-2 h-2 bg-t-tertiary hover:bg-t-tertiary"
              }`}
              title="Overview"
            />
            {review.chapters.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => goTo(i, i > currentIndex ? "right" : "left")}
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? "w-6 h-2 bg-accent"
                    : isChapterReviewed(ch.id)
                    ? "w-2 h-2 bg-green-500"
                    : "w-2 h-2 bg-bd-primary hover:bg-t-tertiary"
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-accent hover:bg-accent/80 text-white transition-colors"
            >
              Finish
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-t-tertiary hover:text-t-primary hover:bg-bg-tertiary transition-colors"
            >
              {isIntro ? "Begin" : "Next"}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="mx-auto flex items-center justify-center gap-4 mt-2 text-[10px] text-bd-primary">
          <span><kbd className="px-1 py-0.5 rounded bg-bg-secondary border border-bd-primary font-mono">←→</kbd> navigate</span>
          {!isIntro && <span><kbd className="px-1 py-0.5 rounded bg-bg-secondary border border-bd-primary font-mono">space</kbd> review</span>}
          {!isIntro && <span><kbd className="px-1 py-0.5 rounded bg-bg-secondary border border-bd-primary font-mono">d</kbd> toggle diff</span>}
          {!isIntro && <span><kbd className="px-1 py-0.5 rounded bg-bg-secondary border border-bd-primary font-mono">w</kbd> whitespace</span>}
          <span><kbd className="px-1 py-0.5 rounded bg-bg-secondary border border-bd-primary font-mono">esc</kbd> exit</span>
        </div>
      </div>
    </div>
  );
}
