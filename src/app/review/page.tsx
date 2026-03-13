"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";
import { NarrativeReview } from "@/lib/types";
import { ReviewContainer } from "@/components/ReviewContainer";
import { useFancyMode } from "@/hooks/useFancyMode";
import { Loader2 } from "lucide-react";

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

  // Unique cache key per source
  const identifier = isLocal
    ? `local:${repoPath}:${baseBranch}:${headBranch}`
    : prUrl || "";

  const [review, setReview] = useState<NarrativeReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparing...");
  const [fromCache, setFromCache] = useState(false);

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

      setLoading(true);
      setError(null);
      setFromCache(false);

      try {
        if (isLocal) {
          setStatus("Running local git diff...");
          const res = await fetch("/api/analyze-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              repoPath,
              baseBranch: baseBranch || undefined,
              headBranch: headBranch || undefined,
              model: modelParam,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          setStatus("Building narrative...");
          const data: NarrativeReview = await res.json();
          setReview(data);
          setCachedAnalysis(identifier, data);
        } else {
          setStatus("Fetching PR diff and metadata...");
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: prUrl, model: modelParam }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          setStatus("Building narrative...");
          const data: NarrativeReview = await res.json();
          setReview(data);
          setCachedAnalysis(identifier, data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [identifier, isLocal, repoPath, baseBranch, headBranch, modelParam, prUrl]
  );

  useEffect(() => {
    analyze();
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
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center relative">
        {fancy && (
          <>
            <div className="fancy-aurora" />
            <div className="fancy-grid" />
          </>
        )}
        <div className="text-center relative z-10">
          <Loader2 className={`w-8 h-8 animate-spin mx-auto mb-4 ${fancy ? "text-indigo-400" : "text-indigo-500"}`} />
          <p className={`text-lg font-medium ${fancy ? "fancy-gradient-text" : "text-zinc-300"}`}>
            {status}
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            {isLocal
              ? "Diffing your local branches and building the narrative..."
              : "Analyzing changes and building your narrative review..."}
          </p>
          <p className="text-zinc-600 text-xs mt-4">
            This may take 30-60 seconds for large diffs
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
