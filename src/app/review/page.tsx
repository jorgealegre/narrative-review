"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";
import { NarrativeReview } from "@/lib/types";
import { ReviewContainer } from "@/components/ReviewContainer";
import { Loader2, RefreshCw } from "lucide-react";

function cacheKey(url: string) {
  return `narrative-review:analysis:${url}`;
}

function getCachedAnalysis(url: string): NarrativeReview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedAnalysis(url: string, review: NarrativeReview) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify(review));
  } catch {
    // localStorage full -- silently fail
  }
}

function ReviewContent() {
  const searchParams = useSearchParams();
  const prUrl = searchParams.get("pr");
  const [review, setReview] = useState<NarrativeReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparing...");
  const [fromCache, setFromCache] = useState(false);

  const modelParam = searchParams.get("model") || undefined;

  const analyze = useCallback(
    async (skipCache = false) => {
      if (!prUrl) return;

      if (!skipCache) {
        const cached = getCachedAnalysis(prUrl);
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
        setCachedAnalysis(prUrl, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [prUrl]
  );

  useEffect(() => {
    analyze();
  }, [analyze]);

  const handleReanalyze = () => {
    if (prUrl) {
      localStorage.removeItem(cacheKey(prUrl));
    }
    analyze(true);
  };

  if (!prUrl) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">
          No PR URL provided. Go back and enter one.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-300 text-lg font-medium">{status}</p>
          <p className="text-zinc-500 text-sm mt-2">
            Analyzing changes and building your narrative review...
          </p>
          <p className="text-zinc-600 text-xs mt-4">
            This may take 30-60 seconds for large PRs
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
