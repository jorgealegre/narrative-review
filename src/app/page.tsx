"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  GitPullRequest,
  ArrowRight,
  Zap,
  Brain,
  Sparkles,
  GitBranch,
  FolderGit2,
  Loader2,
  Scan,
  Layers,
  ShieldCheck,
  Clock,
  X,
  Trash2,
} from "lucide-react";
import { ModelId } from "@/lib/types";
import { useFancyMode } from "@/hooks/useFancyMode";
import { getHistory, removeFromHistory, clearHistory, HistoryEntry } from "@/lib/history";

type SourceMode = "pr" | "local";

const MODELS: {
  id: ModelId;
  name: string;
  desc: string;
  icon: typeof Zap;
  cost: string;
}[] = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    desc: "Fast & cheap",
    icon: Zap,
    cost: "~$0.02",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Sonnet 4.6",
    desc: "Balanced",
    icon: Sparkles,
    cost: "~$0.10",
  },
  {
    id: "claude-opus-4-6",
    name: "Opus 4.6",
    desc: "Deepest analysis",
    icon: Brain,
    cost: "~$0.20",
  },
];

export default function Home() {
  const { fancy } = useFancyMode();
  const [mode, setMode] = useState<SourceMode>("pr");
  const [url, setUrl] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [headBranch, setHeadBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [model, setModel] = useState<ModelId>("claude-sonnet-4-6");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const router = useRouter();

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const fetchBranches = useCallback(async (path: string) => {
    if (!path.trim()) return;
    setLoadingBranches(true);
    setError("");
    try {
      const res = await fetch("/api/local-branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: path }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to read repo");
      }
      const data = await res.json();
      setBranches(data.branches);
      setCurrentBranch(data.current);
      setRepoPath(data.root);
      if (!headBranch) setHeadBranch(data.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read repository");
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }, [headBranch]);

  useEffect(() => {
    if (mode !== "local" || !repoPath.trim()) return;
    const timer = setTimeout(() => fetchBranches(repoPath), 500);
    return () => clearTimeout(timer);
  }, [repoPath, mode, fetchBranches]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "pr") {
      const match = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
      if (!match) {
        setError("Please enter a valid GitHub PR URL");
        return;
      }
      router.push(
        `/review?pr=${encodeURIComponent(url)}&model=${encodeURIComponent(model)}`
      );
    } else {
      if (!repoPath.trim()) {
        setError("Please enter a repository path");
        return;
      }
      const params = new URLSearchParams({
        source: "local",
        repo: repoPath,
        model,
      });
      if (baseBranch) params.set("base", baseBranch);
      if (headBranch) params.set("head", headBranch);
      router.push(`/review?${params.toString()}`);
    }
  };

  const FEATURES = [
    {
      icon: Scan,
      title: "Narrative Order",
      desc: "AI reorders diffs into a causal story — root cause first",
    },
    {
      icon: Layers,
      title: "Complete Coverage",
      desc: "Every hunk accounted for, no changes slip through",
    },
    {
      icon: ShieldCheck,
      title: "Safety Analysis",
      desc: "Per-chapter safety notes flag potential risks",
    },
  ];

  const STEPS = mode === "pr"
    ? [
        { step: "1", title: "Paste PR URL", desc: "Any GitHub pull request" },
        { step: "2", title: "AI Analysis", desc: "Builds the narrative order" },
        { step: "3", title: "Review Story", desc: "Check off chapters, approve" },
      ]
    : [
        { step: "1", title: "Point to repo", desc: "Any local git repository" },
        { step: "2", title: "Pick branches", desc: "Compare head vs base" },
        { step: "3", title: "Review Story", desc: "Understand before pushing" },
      ];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col relative">
      {/* Fancy background layers */}
      {fancy && (
        <>
          <div className="fancy-aurora" />
          <div className="fancy-grid" />
          <div className="fancy-scanline" />
        </>
      )}

      <main className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className="w-full max-w-xl">
          {/* Logo / title */}
          <div className="text-center mb-12">
            <div className={`inline-flex items-center gap-3 mb-6 ${fancy ? "fancy-float" : ""}`}>
              <BookOpen className={`w-12 h-12 ${fancy ? "text-indigo-400" : "text-indigo-500"}`} />
            </div>
            <h1
              className={`text-5xl font-bold mb-4 tracking-tight ${
                fancy ? "fancy-gradient-text fancy-glow-text" : "text-zinc-100"
              }`}
            >
              Narrative Review
            </h1>
            <p className={`text-lg max-w-md mx-auto leading-relaxed ${fancy ? "text-zinc-300" : "text-zinc-400"}`}>
              Code review as a story, not a file list. Understand{" "}
              <em className={fancy ? "text-indigo-300" : "text-zinc-300"}>why</em> changes
              happened, in the order they make sense.
            </p>
          </div>

          {/* Feature pills — fancy only */}
          {fancy && (
            <div className="flex gap-3 mb-8 justify-center fancy-stagger">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="fancy-glass rounded-xl px-4 py-3 text-center flex-1 max-w-[160px]"
                  >
                    <Icon className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-zinc-200">{f.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Main form card */}
          <div
            className={`rounded-2xl p-6 ${
              fancy
                ? "fancy-glass fancy-border-glow"
                : "bg-zinc-900/50 border border-zinc-800"
            }`}
          >
            {/* Source mode tabs */}
            <div className={`flex gap-1 rounded-lg p-0.5 mb-4 ${
              fancy ? "bg-zinc-900/60 border border-zinc-800/50" : "bg-zinc-900 border border-zinc-800"
            }`}>
              <button
                type="button"
                onClick={() => { setMode("pr"); setError(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${
                  mode === "pr"
                    ? fancy
                      ? "bg-indigo-500/15 text-indigo-300 shadow-sm"
                      : "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <GitPullRequest className="w-4 h-4" />
                GitHub PR
              </button>
              <button
                type="button"
                onClick={() => { setMode("local"); setError(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${
                  mode === "local"
                    ? fancy
                      ? "bg-indigo-500/15 text-indigo-300 shadow-sm"
                      : "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <FolderGit2 className="w-4 h-4" />
                Local Branch
              </button>
            </div>

            {/* Input form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "pr" ? (
                <div className="relative group">
                  <GitPullRequest className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setError("");
                    }}
                    placeholder="https://github.com/owner/repo/pull/123"
                    className={`w-full rounded-xl pl-12 pr-4 py-4 text-zinc-100 placeholder-zinc-600 focus:outline-none transition-all text-lg ${
                      fancy
                        ? "bg-zinc-900/60 border border-zinc-700/50 focus:border-indigo-500/50 focus:shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]"
                        : "bg-zinc-900 border border-zinc-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                    }`}
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <FolderGit2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="text"
                      value={repoPath}
                      onChange={(e) => {
                        setRepoPath(e.target.value);
                        setError("");
                      }}
                      placeholder="/Users/you/Developer/your-project"
                      className={`w-full rounded-xl pl-12 pr-4 py-4 text-zinc-100 placeholder-zinc-600 focus:outline-none transition-all text-lg ${
                        fancy
                          ? "bg-zinc-900/60 border border-zinc-700/50 focus:border-indigo-500/50 focus:shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]"
                          : "bg-zinc-900 border border-zinc-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                      }`}
                      autoFocus
                    />
                    {loadingBranches && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
                    )}
                  </div>

                  {branches.length > 0 && (
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-zinc-500 px-1">
                          Base (compare against)
                        </label>
                        <div className="relative">
                          <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                          <select
                            value={baseBranch}
                            onChange={(e) => setBaseBranch(e.target.value)}
                            className={`w-full rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 focus:outline-none appearance-none ${
                              fancy
                                ? "bg-zinc-900/60 border border-zinc-700/50 focus:border-indigo-500/50"
                                : "bg-zinc-900 border border-zinc-800 focus:ring-2 focus:ring-indigo-500/50"
                            }`}
                          >
                            <option value="">auto-detect</option>
                            {branches.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-end pb-2.5 text-zinc-700">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-zinc-500 px-1">
                          Head (your changes)
                        </label>
                        <div className="relative">
                          <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                          <select
                            value={headBranch}
                            onChange={(e) => setHeadBranch(e.target.value)}
                            className={`w-full rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 focus:outline-none appearance-none ${
                              fancy
                                ? "bg-zinc-900/60 border border-zinc-700/50 focus:border-indigo-500/50"
                                : "bg-zinc-900 border border-zinc-800 focus:ring-2 focus:ring-indigo-500/50"
                            }`}
                          >
                            {branches.map((b) => (
                              <option key={b} value={b}>
                                {b}{b === currentBranch ? " (current)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentBranch && (
                    <p className="text-xs text-zinc-600 px-1">
                      Comparing{" "}
                      <span className="text-zinc-400">{headBranch || currentBranch}</span>
                      {" "}against{" "}
                      <span className="text-zinc-400">{baseBranch || "auto-detected base"}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Model selector */}
              <div className="flex gap-2">
                {MODELS.map((m) => {
                  const Icon = m.icon;
                  const selected = model === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                        selected
                          ? fancy
                            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 shadow-[0_0_16px_-4px_rgba(99,102,241,0.25)]"
                            : "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                          : fancy
                            ? "border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <div className="text-left min-w-0">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs opacity-60">
                          {m.desc} &middot; {m.cost}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && <p className="text-red-400 text-sm px-1">{error}</p>}

              <button
                type="submit"
                className={`w-full font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-lg ${
                  fancy
                    ? "fancy-shimmer-btn text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {mode === "pr" ? "Analyze PR" : "Analyze Branch"}
                  <ArrowRight className="w-5 h-5" />
                </span>
              </button>
            </form>
          </div>

          {/* How it works */}
          <div className={`mt-16 grid grid-cols-3 gap-6 text-center ${fancy ? "fancy-stagger" : ""}`}>
            {STEPS.map((item) => (
              <div key={item.step}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-2 ${
                    fancy
                      ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {item.step}
                </div>
                <p className={`text-sm font-medium ${fancy ? "text-zinc-200" : "text-zinc-300"}`}>
                  {item.title}
                </p>
                <p className="text-zinc-600 text-xs mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
          {/* Recent reviews */}
          {history.length > 0 && (
            <div className="mt-16">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-600" />
                  <h2 className="text-sm font-medium text-zinc-400">Recent reviews</h2>
                </div>
                <button
                  onClick={() => {
                    clearHistory();
                    setHistory([]);
                  }}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {history.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className={`group flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-all ${
                      fancy
                        ? "bg-zinc-900/40 border border-zinc-800/40 hover:border-indigo-500/20 hover:bg-zinc-900/60"
                        : "bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700"
                    }`}
                    onClick={() => router.push(entry.url)}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      entry.source === "pr" ? "bg-indigo-500/15" : "bg-emerald-500/15"
                    }`}>
                      {entry.source === "pr" ? (
                        <GitPullRequest className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{entry.title}</p>
                      <p className="text-xs text-zinc-600 truncate">
                        {entry.label} &middot; {entry.chapters} chapters &middot; {new Date(entry.analyzedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(entry.id);
                        setHistory((h) => h.filter((x) => x.id !== entry.id));
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-zinc-400 transition-all"
                      title="Remove from history"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-4 text-center relative z-10">
        <p className="text-zinc-700 text-xs">
          Powered by Claude &middot; Diffs via {mode === "pr" ? "gh CLI" : "local git"}
        </p>
      </footer>
    </div>
  );
}
