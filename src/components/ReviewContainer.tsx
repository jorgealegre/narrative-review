"use client";

import { useEffect, useCallback, useState } from "react";
import { NarrativeReview } from "@/lib/types";
import { useReviewState } from "@/hooks/useReviewState";
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
} from "lucide-react";

interface ReviewContainerProps {
  review: NarrativeReview;
  fromCache?: boolean;
  onReanalyze?: () => void;
}

export function ReviewContainer({ review, fromCache, onReanalyze }: ReviewContainerProps) {
  const prId = `${review.prInfo.owner}/${review.prInfo.repo}#${review.prInfo.number}`;
  const prUrl = `https://github.com/${review.prInfo.owner}/${review.prInfo.repo}/pull/${review.prInfo.number}`;

  const { toggleChapter, isChapterReviewed, reviewedCount } =
    useReviewState(prId);

  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    review.chapters[0]?.id || null
  );
  const [approvalState, setApprovalState] = useState<
    "idle" | "loading" | "approved" | "changes-requested" | "error"
  >("idle");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const allReviewed =
    reviewedCount === review.chapters.length && review.chapters.length > 0;

  const scrollToChapter = useCallback((id: string) => {
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ProgressTracker
        reviewedCount={reviewedCount}
        totalChapters={review.chapters.length}
        coverage={review.coverage}
        metrics={review.metrics}
        prTitle={review.title}
        prUrl={prUrl}
      />

      <div className="flex">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarCollapsed((s) => !s)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-zinc-900 border border-zinc-700 rounded-r-lg px-1 py-3 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <svg
            className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Sidebar */}
        <aside
          className={`flex-shrink-0 border-r border-zinc-800 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto p-4 transition-all duration-300 ${
            sidebarCollapsed ? "w-0 p-0 overflow-hidden border-r-0" : "w-80"
          }`}
        >
          <div className="mb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">
              Story
            </p>
            <p className="text-xs text-zinc-600 leading-relaxed">{review.summary}</p>
          </div>
          <ChapterTimeline
            chapters={review.chapters}
            activeChapterId={activeChapterId}
            isChapterReviewed={isChapterReviewed}
            onSelectChapter={scrollToChapter}
          />

          {/* Actions */}
          <div className="mt-6 pt-4 border-t border-zinc-800 space-y-2">
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on GitHub
            </a>
            <button
              onClick={() => setWalkthroughMode(true)}
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Play className="w-4 h-4" />
              Walkthrough mode
            </button>
            <button
              onClick={() => setChatOpen((s) => !s)}
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Ask about this PR
            </button>
            {onReanalyze && (
              <button
                onClick={onReanalyze}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Re-analyze{fromCache ? " (cached)" : ""}
              </button>
            )}
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Keyboard className="w-4 h-4" />
              Keyboard shortcuts
            </button>
          </div>

          {/* Approval */}
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
            {approvalState === "approved" ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <ThumbsUp className="w-4 h-4" />
                PR approved
              </div>
            ) : approvalState === "changes-requested" ? (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <MessageSquareWarning className="w-4 h-4" />
                Changes requested
              </div>
            ) : (
              <>
                <button
                  onClick={handleApprove}
                  disabled={!allReviewed || approvalState === "loading"}
                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    allReviewed
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  }`}
                  title={
                    allReviewed
                      ? "Approve this PR"
                      : "Review all chapters first"
                  }
                >
                  <ThumbsUp className="w-4 h-4" />
                  {approvalState === "loading"
                    ? "Submitting..."
                    : "Approve on GitHub"}
                </button>
                <button
                  onClick={handleRequestChanges}
                  disabled={approvalState === "loading"}
                  className="w-full py-2 px-3 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquareWarning className="w-4 h-4" />
                  Request changes
                </button>
              </>
            )}
            {approvalState === "error" && (
              <p className="text-xs text-red-400">
                Failed to submit review. Check your gh CLI auth.
              </p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 py-8 max-w-5xl">
          {/* Summary card */}
          <div className="mb-8 p-5 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Root Cause
                </h2>
                <p className="text-zinc-200">{review.rootCause}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 ml-5">{review.summary}</p>
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
                prUrl={prUrl}
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
                You can now approve the PR from the sidebar.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Chat panel */}
      <ChatPanel
        review={review}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

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
    </div>
  );
}
