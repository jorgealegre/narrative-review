"use client";

import { useEffect, useCallback, useState } from "react";
import { NarrativeReview, DiffSettings, DiffViewMode } from "@/lib/types";
import { useReviewState } from "@/hooks/useReviewState";
import { useFancyMode } from "@/hooks/useFancyMode";
import { ChapterCard } from "./ChapterCard";
import { ChapterTimeline } from "./ChapterTimeline";
import { ProgressTracker } from "./ProgressTracker";
import { WalkthroughMode } from "./WalkthroughMode";
import {
  ExternalLink,
  Keyboard,
  Play,
  EyeOff,
  Eye,
  Rows3,
  Columns2,
  AlignJustify,
  Download,
  ChevronsDownUp,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface ReviewContainerProps {
  review: NarrativeReview;
  fileContents?: Record<string, string>;
}

export function ReviewContainer({ review, fileContents }: ReviewContainerProps) {
  const { fancy } = useFancyMode();
  const prId = `${review.prInfo.owner}/${review.prInfo.repo}#${review.prInfo.number}`;
  const prUrl = `https://github.com/${review.prInfo.owner}/${review.prInfo.repo}/pull/${review.prInfo.number}`;

  const { toggleChapter, isChapterReviewed, reviewedCount, setNote, state: reviewState } =
    useReviewState(prId);

  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overviewActive, setOverviewActive] = useState(true);
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [diffSettings, setDiffSettings] = useState<DiffSettings>({
    hideWhitespace: false,
    viewMode: "unified",
  });
  const [allExpanded, setAllExpanded] = useState(true);
  const allReviewed =
    reviewedCount === review.chapters.length && review.chapters.length > 0;

  useEffect(() => {
    if (allReviewed) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [allReviewed]);

  const scrollToChapter = useCallback((id: string) => {
    setOverviewActive(false);
    setActiveChapterId(id);
    const el = document.getElementById(`chapter-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const activeIndex = review.chapters.findIndex(
    (c) => c.id === activeChapterId
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const next = Math.min(activeIndex + 1, review.chapters.length - 1);
          scrollToChapter(review.chapters[next].id);
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(activeIndex - 1, 0);
          scrollToChapter(review.chapters[prev].id);
          break;
        }
        case " ": {
          e.preventDefault();
          if (activeChapterId) toggleChapter(activeChapterId);
          break;
        }
        case "n": {
          e.preventDefault();
          const nextUnreviewed = review.chapters.find(
            (c) => !isChapterReviewed(c.id)
          );
          if (nextUnreviewed) scrollToChapter(nextUnreviewed.id);
          break;
        }
        case "?": {
          e.preventDefault();
          setShowShortcuts((s) => !s);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, activeChapterId, review.chapters, scrollToChapter, toggleChapter, isChapterReviewed]);

  const handleExportMarkdown = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# ${review.title}\n`);
    lines.push(`**Summary:** ${review.summary}\n`);
    lines.push(`**Root cause:** ${review.rootCause}\n`);
    lines.push(`**PR:** ${prUrl}\n`);
    lines.push(`**Files changed:** ${review.prInfo.changedFiles} (+${review.prInfo.additions}/-${review.prInfo.deletions})\n`);
    lines.push(`---\n`);

    review.chapters.forEach((ch, i) => {
      lines.push(`## ${i + 1}. ${ch.title}\n`);
      if (ch.connectionToPrevious) lines.push(`> ${ch.connectionToPrevious}\n`);
      lines.push(`${ch.narrative}\n`);
      if (ch.safetyNotes?.length) {
        ch.safetyNotes.forEach((n) => lines.push(`- ⚠️ ${n}`));
        lines.push("");
      }
      const chapterNote = reviewState.notes[ch.id];
      if (chapterNote) {
        lines.push(`**My notes:** ${chapterNote}\n`);
      }
      lines.push(`**Files:** ${[...new Set(ch.hunks.map((h) => h.file))].join(", ")}\n`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `narrative-review-${review.prInfo.repo}-${review.prInfo.number}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [review, prUrl, reviewState.notes]);

  return (
    <div className="min-h-screen bg-bg-primary text-t-primary relative">
      {fancy && (
        <>
          <div className="fancy-aurora" />
          <div className="fancy-grid" />
        </>
      )}

      <ProgressTracker
        reviewedCount={reviewedCount}
        totalChapters={review.chapters.length}
        coverage={review.coverage}
        metrics={review.metrics}
        prTitle={review.title}
        prUrl={prUrl}
      />

      <div className="flex">
        <aside
          className={`flex-shrink-0 border-r border-bd-primary sticky top-[73px] h-[calc(100vh-73px)] transition-[width,opacity] duration-300 ease-in-out ${
            sidebarCollapsed ? "w-12" : "w-80"
          }`}
        >
          <div className={`flex flex-col items-center gap-1 py-3 transition-opacity duration-200 ${sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"}`}>
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 text-t-tertiary hover:text-t-primary hover:bg-bg-tertiary rounded-lg transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="w-5 border-t border-bd-primary my-1" />
            <button
              onClick={() => setWalkthroughMode(true)}
              className="p-2 text-accent-text hover:text-accent-text hover:bg-accent-muted rounded-lg transition-colors"
              title="Guided walkthrough"
            >
              <Play className="w-4 h-4" />
            </button>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-t-tertiary hover:text-t-primary hover:bg-bg-tertiary rounded-lg transition-colors"
              title="View on GitHub"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className={`h-full flex flex-col overflow-hidden transition-opacity duration-200 ${sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
              <span className="text-xs text-t-tertiary uppercase tracking-wider font-semibold">Chapters</span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 text-t-tertiary hover:text-t-secondary rounded transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 pb-3 flex-shrink-0 space-y-1.5">
              <button
                onClick={() => setWalkthroughMode(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-muted border border-accent/20 text-accent-text hover:bg-accent/20 hover:border-accent/30 transition-colors"
              >
                <Play className="w-4 h-4" />
                Guided Walkthrough
              </button>
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-bg-tertiary/80 border border-bd-primary/50 text-t-secondary hover:bg-bg-tertiary hover:border-t-tertiary transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                GitHub
              </a>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <ChapterTimeline
                review={review}
                chapters={review.chapters}
                activeChapterId={activeChapterId}
                isChapterReviewed={isChapterReviewed}
                onSelectChapter={(id) => { setOverviewActive(false); scrollToChapter(id); }}
                onSelectOverview={() => {
                  setOverviewActive(true);
                  setActiveChapterId(null);
                  const el = document.getElementById("review-overview");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                overviewActive={overviewActive}
              />
            </div>

            <div className="flex-shrink-0 border-t border-bd-primary px-3 py-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-t-tertiary hover:text-t-secondary hover:bg-bg-tertiary/60 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
                <button
                  onClick={() => setShowShortcuts((s) => !s)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-t-tertiary hover:text-t-secondary hover:bg-bg-tertiary/60 transition-colors"
                >
                  <Keyboard className="w-3 h-3" />
                  Keys
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8">
          <div
            id="review-overview"
            className={`mb-8 p-5 rounded-xl ${
              fancy
                ? "fancy-glass fancy-border-glow"
                : "bg-bg-secondary/50 border border-bd-primary"
            }`}
          >
            <p className="text-lg text-t-primary leading-relaxed mb-4">{review.summary}</p>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider mb-1">
                  Root Cause
                </h2>
                <p className="text-t-secondary text-sm">{review.rootCause}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-bd-subtle/50 text-xs text-t-tertiary">
              {review.prInfo.author && <span>by {review.prInfo.author}</span>}
              <span>{review.prInfo.changedFiles} files changed</span>
              <span className="text-green-500/70">+{review.prInfo.additions}</span>
              <span className="text-red-500/70">−{review.prInfo.deletions}</span>
              <span>{review.chapters.length} chapters</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-1 bg-bg-secondary border border-bd-primary rounded-lg p-0.5">
              {([
                { mode: "unified" as DiffViewMode, icon: AlignJustify, label: "Unified" },
                { mode: "compact" as DiffViewMode, icon: Rows3, label: "Compact" },
                { mode: "split" as DiffViewMode, icon: Columns2, label: "Split" },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setDiffSettings((s) => ({ ...s, viewMode: mode }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    diffSettings.viewMode === mode
                      ? "bg-bg-tertiary text-t-primary"
                      : "text-t-tertiary hover:text-t-secondary"
                  }`}
                  title={label}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAllExpanded((s) => !s)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border bg-bg-secondary border-bd-primary text-t-tertiary hover:text-t-secondary hover:border-bd-primary transition-colors"
              >
                {allExpanded ? (
                  <ChevronsDownUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                )}
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
              <button
                onClick={() => setDiffSettings((s) => ({ ...s, hideWhitespace: !s.hideWhitespace }))}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                  diffSettings.hideWhitespace
                    ? "bg-accent-muted border-accent/30 text-accent-text"
                    : "bg-bg-secondary border-bd-primary text-t-tertiary hover:text-t-secondary hover:border-bd-primary"
                }`}
              >
                {diffSettings.hideWhitespace ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {diffSettings.hideWhitespace ? "Whitespace hidden" : "Hide whitespace"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {review.chapters.map((chapter, i) => (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                index={i}
                isReviewed={isChapterReviewed(chapter.id)}
                isActive={chapter.id === activeChapterId}
                onToggleReview={() => toggleChapter(chapter.id)}
                onActivate={() => setActiveChapterId(chapter.id)}
                prUrl={prUrl}
                diffSettings={diffSettings}
                note={reviewState.notes[chapter.id] || ""}
                onNoteChange={(n) => setNote(chapter.id, n)}
                defaultExpanded={allExpanded}
                fileContents={fileContents}
              />
            ))}
          </div>

          {allReviewed && (
            <div className="mt-8 text-center py-8">
              <p className="text-green-400 text-lg font-semibold">
                All chapters reviewed
              </p>
              <p className="text-t-tertiary text-sm mt-1">
                Review complete.
              </p>
            </div>
          )}
        </main>

      </div>

      {walkthroughMode && (
        <WalkthroughMode
          review={review}
          isChapterReviewed={isChapterReviewed}
          onToggleReview={toggleChapter}
          onExit={() => setWalkthroughMode(false)}
          startChapterId={activeChapterId || undefined}
          fileContents={fileContents}
        />
      )}

      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-bg-secondary border border-bd-primary rounded-xl p-6 max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-3 text-sm">
              {[
                ["j", "Next chapter"],
                ["k", "Previous chapter"],
                ["Space", "Toggle reviewed"],
                ["n", "Jump to next unreviewed"],
                ["?", "Toggle this help"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="bg-bg-tertiary border border-bd-primary rounded px-2 py-0.5 text-xs font-mono text-t-secondary min-w-[2rem] text-center">
                    {key}
                  </kbd>
                  <span className="text-t-tertiary">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCelebration && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="animate-celebrate bg-bg-secondary/90 border border-green-500/30 rounded-2xl px-8 py-6 text-center shadow-2xl shadow-green-500/10">
            <div className="text-4xl mb-3">&#x2705;</div>
            <h3 className="text-xl font-bold text-green-400 mb-1">
              All chapters reviewed!
            </h3>
            <p className="text-sm text-t-tertiary">
              Ready to approve this PR
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
