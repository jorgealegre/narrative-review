"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { NarrativeReview } from "@/lib/types";
import { ReviewContainer } from "@/components/ReviewContainer";
import { useFancyMode } from "@/hooks/useFancyMode";
import { addToHistory } from "@/lib/history";
import { Loader2, Check, GitPullRequest, Brain, ShieldCheck } from "lucide-react";

function cacheKey(identifier: string) {
  return `narrative-review:analysis:${identifier}`;
}

function getCachedAnalysis(identifier: string): NarrativeReview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(identifier));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedAnalysis(identifier: string, review: NarrativeReview) {
  try {
    localStorage.setItem(cacheKey(identifier), JSON.stringify(review));
  } catch {
    // localStorage full
  }
}

function ReviewContent() {
  const { fancy } = useFancyMode();
  const searchParams = useSearchParams();
  const source = searchParams.get("source"); // "local" or null (PR)
  const prUrl = searchParams.get("pr");
  const repoPath = searchParams.get("repo");
  const baseBranch = searchParams.get("base") || "";
  const headBranch = searchParams.get("head") || "";
  const modelParam = searchParams.get("model") || undefined;

  const isLocal = source === "local";

  // Unique cache key per source + model
  const identifier = isLocal
    ? `local:${repoPath}:${baseBranch}:${headBranch}:${modelParam || ""}`
    : `${prUrl || ""}:${modelParam || ""}`;

  const [review, setReview] = useState<NarrativeReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparing...");
  const [fromCache, setFromCache] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (skipCache = false) => {
      if (!identifier) return;

      if (!skipCache) {
        const cached = getCachedAnalysis(identifier);
        if (cached) {
          setReview(cached);
          setFromCache(true);
          return;
        }
      }

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setFromCache(false);

      try {
        const endpoint = isLocal ? "/api/analyze-local" : "/api/analyze";
        const body = isLocal
          ? { repoPath, baseBranch: baseBranch || undefined, headBranch: headBranch || undefined, model: modelParam }
          : { url: prUrl, model: modelParam };

        setStatus(isLocal ? "Running local git diff..." : "Fetching PR diff and metadata...");
        const t1 = setTimeout(() => setStatus("Sending to Claude..."), isLocal ? 2000 : 3000);
        const t2 = setTimeout(() => setStatus("Building narrative..."), isLocal ? 6000 : 8000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(t1);
        clearTimeout(t2);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setStatus("Building narrative...");
        const data: NarrativeReview = await res.json();

        // Don't update state if this request was aborted
        if (controller.signal.aborted) return;

        setReview(data);
        setCachedAnalysis(identifier, data);
        addToHistory({
          id: identifier,
          title: data.title,
          source: isLocal ? "local" : "pr",
          label: isLocal
            ? `${data.prInfo.headRef} → ${data.prInfo.baseRef}`
            : `${data.prInfo.owner}/${data.prInfo.repo}#${data.prInfo.number}`,
          url: isLocal
            ? `/review?${new URLSearchParams({ source: "local", repo: repoPath!, base: baseBranch, head: headBranch, model: modelParam || "" }).toString()}`
            : `/review?pr=${encodeURIComponent(prUrl!)}&model=${encodeURIComponent(modelParam || "")}`,
          analyzedAt: data.analyzedAt,
          chapters: data.chapters.length,
          model: data.metrics?.model || modelParam || "",
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [identifier, isLocal, repoPath, baseBranch, headBranch, modelParam, prUrl]
  );

  useEffect(() => {
    analyze();
    return () => { abortRef.current?.abort(); };
  }, [analyze]);

  const handleReanalyze = () => {
    localStorage.removeItem(cacheKey(identifier));
    analyze(true);
  };

  if (!prUrl && !isLocal) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">
          No source provided. Go back and enter a PR URL or repo path.
        </p>
      </div>
    );
  }

  if (loading) {
    const steps = isLocal
      ? [
          { label: "Running git diff", key: "diff" },
          { label: "Sending to Claude", key: "send" },
          { label: "Building narrative", key: "narrative" },
        ]
      : [
          { label: "Fetching PR data", key: "fetch" },
          { label: "Sending to Claude", key: "send" },
          { label: "Building narrative", key: "narrative" },
        ];

    const activeStep = status.includes("narrative") || status.includes("Building")
      ? 2
      : status.includes("diff") || status.includes("Fetching") || status.includes("metadata")
        ? 0
        : 1;

    const stepIcons = [GitPullRequest, Brain, ShieldCheck];

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center relative">
        {fancy && (
          <>
            <div className="fancy-aurora" />
            <div className="fancy-grid" />
          </>
        )}
        <div className="relative z-10 w-full max-w-sm px-6">
          <Loader2 className={`w-10 h-10 animate-spin mx-auto mb-8 ${fancy ? "text-indigo-400" : "text-indigo-500"}`} />

          <div className="space-y-3">
            {steps.map((step, i) => {
              const Icon = stepIcons[i];
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
                    isActive
                      ? fancy
                        ? "fancy-glass fancy-border-glow"
                        : "bg-zinc-900 border border-indigo-500/30"
                      : isDone
                        ? "bg-zinc-900/30 border border-zinc-800/50"
                        : "bg-zinc-900/20 border border-zinc-800/30"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone
                      ? "bg-green-500/20"
                      : isActive
                        ? "bg-indigo-500/20"
                        : "bg-zinc-800/50"
                  }`}>
                    {isDone ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : isActive ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 text-zinc-600" />
                    )}
                  </div>
                  <span className={`text-sm ${
                    isDone
                      ? "text-zinc-500"
                      : isActive
                        ? "text-zinc-200 font-medium"
                        : "text-zinc-600"
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-zinc-600 text-xs mt-6 text-center">
            This may take 30–60 seconds for large diffs
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg font-medium mb-2">
            Analysis Failed
          </p>
          <p className="text-zinc-400 text-sm mb-4">{error}</p>
          <button
            onClick={handleReanalyze}
            className="text-indigo-400 hover:text-indigo-300 text-sm underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!review) return null;

  return (
    <ReviewContainer
      review={review}
      fromCache={fromCache}
      onReanalyze={handleReanalyze}
    />
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}
