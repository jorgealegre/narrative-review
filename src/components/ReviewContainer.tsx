"use client";

import { useEffect, useCallback, useState } from "react";
import { NarrativeReview, DiffSettings, DiffViewMode } from "@/lib/types";
import { useReviewState } from "@/hooks/useReviewState";
import { useFancyMode } from "@/hooks/useFancyMode";
import { ChapterCard } from "./ChapterCard";
import { ChapterTimeline } from "./ChapterTimeline";
import { ProgressTracker } from "./ProgressTracker";
import { WalkthroughMode } from "./WalkthroughMode";
import { ChatPanel } from "./ChatPanel";
import {
  ThumbsUp,
  MessageSquareWarning,
  ExternalLink,
  Keyboard,
  RefreshCw,
  Play,
  MessageCircle,
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
  fromCache?: boolean;
  onReanalyze?: () => void;
  mode?: "interactive" | "static";
}

export function ReviewContainer({ review, fromCache, onReanalyze, mode = "interactive" }: ReviewContainerProps) {
  const isStatic = mode === "static";
  const { fancy } = useFancyMode();
  const isLocal = review.prInfo.number === 0;
  const prId = isLocal
    ? `local:${review.prInfo.repo}:${review.prInfo.baseRef}:${review.prInfo.headRef}`
    : `${review.prInfo.owner}/${review.prInfo.repo}#${review.prInfo.number}`;
  const prUrl = isLocal
    ? ""
    : `https://github.com/${review.prInfo.owner}/${review.prInfo.repo}/pull/${review.prInfo.number}`;

  const { toggleChapter, isChapterReviewed, reviewedCount, setNote, state: reviewState } =
    useReviewState(prId);

  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<
    "idle" | "loading" | "approved" | "changes-requested" | "error"
  >("idle");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overviewActive, setOverviewActive] = useState(true);
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialQuestion, setChatInitialQuestion] = useState<string | undefined>();
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

  // Keyboard navigation
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

  const handleAskAbout = useCallback((question: string) => {
    setChatInitialQuestion(question);
    setChatOpen(true);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# ${review.title}\n`);
    lines.push(`**Summary:** ${review.summary}\n`);
    lines.push(`**Root cause:** ${review.rootCause}\n`);
    if (!isLocal) lines.push(`**PR:** ${prUrl}\n`);
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
    a.download = `narrative-review-${review.prInfo.repo}-${review.prInfo.number || "local"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [review, prUrl, isLocal, reviewState.notes]);

  const handleApprove = async () => {
    setApprovalState("loading");
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: review.prInfo.owner,
          repo: review.prInfo.repo,
          number: review.prInfo.number,
          action: "approve",
          body: `Reviewed via Narrative Review — ${review.chapters.length} chapters, all changes verified.`,
        }),
      });
      if (!res.ok) throw new Error("Approval failed");
      setApprovalState("approved");
    } catch {
      setApprovalState("error");
    }
  };

  const handleRequestChanges = async () => {
    const comment = prompt("What changes are needed?");
    if (!comment) return;
    setApprovalState("loading");
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: review.prInfo.owner,
          repo: review.prInfo.repo,
          number: review.prInfo.number,
          action: "request-changes",
          body: comment,
        }),
      });
      if (!res.ok) throw new Error("Request changes failed");
      setApprovalState("changes-requested");
    } catch {
      setApprovalState("error");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative">
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
        {/* Sidebar */}
        <aside
          className={`flex-shrink-0 border-r border-zinc-800 sticky top-[73px] h-[calc(100vh-73px)] transition-[width,opacity] duration-300 ease-in-out ${
            sidebarCollapsed ? "w-12" : "w-80"
          }`}
        >
          {/* Collapsed state — icon strip */}
          <div className={`flex flex-col items-center gap-1 py-3 transition-opacity duration-200 ${sidebarCollapsed ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"}`}>
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="w-5 border-t border-zinc-800 my-1" />
            <button
              onClick={() => setWalkthroughMode(true)}
              className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
              title="Guided walkthrough"
            >
              <Play className="w-4 h-4" />
            </button>
            {!isStatic && (
              <button
                onClick={() => setChatOpen((s) => !s)}
                className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                title="Ask about this PR"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            )}
            {!isLocal && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* Expanded state */}
          <div className={`h-full flex flex-col overflow-hidden transition-opacity duration-200 ${sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            {/* Header with collapse button */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Chapters</span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 text-zinc-600 hover:text-zinc-300 rounded transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* Primary actions — prominent */}
            <div className="px-3 pb-3 flex-shrink-0 space-y-1.5">
              <button
                onClick={() => setWalkthroughMode(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-colors"
              >
                <Play className="w-4 h-4" />
                Guided Walkthrough
              </button>
              <div className="flex gap-1.5">
                {!isStatic && (
                  <button
                    onClick={() => setChatOpen((s) => !s)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Ask AI
                  </button>
                )}
                {!isLocal && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    GitHub
                  </a>
                )}
              </div>
            </div>

            {/* Chapter list */}
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

            {/* Secondary actions & approval */}
            <div className="flex-shrink-0 border-t border-zinc-800 px-3 py-3 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {onReanalyze && (
                  <button
                    onClick={onReanalyze}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-analyze{fromCache ? " (cached)" : ""}
                  </button>
                )}
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
                <button
                  onClick={() => setShowShortcuts((s) => !s)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                >
                  <Keyboard className="w-3 h-3" />
                  Keys
                </button>
              </div>

              {/* Approval -- only for GitHub PRs, not in static mode */}
              {!isLocal && !isStatic && (
                <div className="space-y-1.5">
                  {approvalState === "approved" ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm px-1">
                      <ThumbsUp className="w-4 h-4" />
                      PR approved
                    </div>
                  ) : approvalState === "changes-requested" ? (
                    <div className="flex items-center gap-2 text-amber-400 text-sm px-1">
                      <MessageSquareWarning className="w-4 h-4" />
                      Changes requested
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleApprove}
                        disabled={!allReviewed || approvalState === "loading"}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                          allReviewed
                            ? "bg-green-600 hover:bg-green-500 text-white"
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        }`}
                        title={allReviewed ? "Approve this PR" : "Review all chapters first"}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        {approvalState === "loading" ? "..." : "Approve"}
                      </button>
                      <button
                        onClick={handleRequestChanges}
                        disabled={approvalState === "loading"}
                        className="flex-1 py-1.5 px-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <MessageSquareWarning className="w-3 h-3" />
                        Changes
                      </button>
                    </div>
                  )}
                  {approvalState === "error" && (
                    <p className="text-[10px] text-red-400 px-1">
                      Failed — check gh CLI auth.
                    </p>
                  )}
                </div>
              )}

              {/* Local branch info */}
              {isLocal && (
                <p className="text-[10px] text-zinc-600 px-1">
                  Local &middot;{" "}
                  <span className="text-zinc-400">{review.prInfo.headRef}</span>
                  {" "}vs{" "}
                  <span className="text-zinc-400">{review.prInfo.baseRef}</span>
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 py-8 max-w-5xl">
          {/* Overview / Chapter 0 */}
          <div
            id="review-overview"
            className={`mb-8 p-5 rounded-xl ${
              fancy
                ? "fancy-glass fancy-border-glow"
                : "bg-zinc-900/50 border border-zinc-800"
            }`}
          >
            <p className="text-lg text-zinc-200 leading-relaxed mb-4">{review.summary}</p>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Root Cause
                </h2>
                <p className="text-zinc-300 text-sm">{review.rootCause}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800/50 text-xs text-zinc-500">
              {review.prInfo.author && <span>by {review.prInfo.author}</span>}
              <span>{review.prInfo.changedFiles} files changed</span>
              <span className="text-green-500/70">+{review.prInfo.additions}</span>
              <span className="text-red-500/70">−{review.prInfo.deletions}</span>
              <span>{review.chapters.length} chapters</span>
            </div>
          </div>

          {/* Diff settings toolbar */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
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
                      ? "bg-zinc-800 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300"
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
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
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
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

          {/* Chapters */}
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
                prUrl={isLocal ? undefined : prUrl}
                prInfo={isLocal ? undefined : review.prInfo}
                diffSettings={diffSettings}
                onAskAbout={isStatic ? undefined : handleAskAbout}
                note={reviewState.notes[chapter.id] || ""}
                onNoteChange={(n) => setNote(chapter.id, n)}
                defaultExpanded={allExpanded}
              />
            ))}
          </div>

          {/* End of review */}
          {allReviewed && (
            <div className="mt-8 text-center py-8">
              <p className="text-green-400 text-lg font-semibold">
                All chapters reviewed
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {isStatic ? "Review complete." : "You can now approve the PR from the sidebar."}
              </p>
            </div>
          )}
        </main>

        {/* Chat panel — in-flow, right side */}
        {!isStatic && (
          <ChatPanel
            review={review}
            isOpen={chatOpen}
            onClose={() => {
              setChatOpen(false);
              setChatInitialQuestion(undefined);
            }}
            initialQuestion={chatInitialQuestion}
          />
        )}
      </div>

      {/* Walkthrough mode overlay */}
      {walkthroughMode && (
        <WalkthroughMode
          review={review}
          isChapterReviewed={isChapterReviewed}
          onToggleReview={toggleChapter}
          onExit={() => setWalkthroughMode(false)}
          startChapterId={activeChapterId || undefined}
        />
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm"
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
                  <kbd className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs font-mono text-zinc-300 min-w-[2rem] text-center">
                    {key}
                  </kbd>
                  <span className="text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Celebration overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="animate-celebrate bg-zinc-900/90 border border-green-500/30 rounded-2xl px-8 py-6 text-center shadow-2xl shadow-green-500/10">
            <div className="text-4xl mb-3">&#x2705;</div>
            <h3 className="text-xl font-bold text-green-400 mb-1">
              All chapters reviewed!
            </h3>
            <p className="text-sm text-zinc-400">
              Ready to approve this PR
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
