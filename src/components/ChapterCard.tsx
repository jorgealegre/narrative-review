"use client";

import { Chapter, DiffSettings } from "@/lib/types";
import { DiffView } from "./DiffView";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
  StickyNote,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useFancyMode } from "@/hooks/useFancyMode";
import { useTheme } from "@/hooks/useTheme";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ChapterCardProps {
  chapter: Chapter;
  index: number;
  isReviewed: boolean;
  isActive: boolean;
  onToggleReview: () => void;
  onActivate: () => void;
  prUrl?: string;
  diffSettings?: DiffSettings;
  note?: string;
  onNoteChange?: (note: string) => void;
  defaultExpanded?: boolean;
  fileContents?: Record<string, string>;
}

export function ChapterCard({
  chapter,
  index,
  isReviewed,
  isActive,
  onToggleReview,
  onActivate,
  prUrl,
  diffSettings,
  note,
  onNoteChange,
  defaultExpanded = true,
  fileContents,
}: ChapterCardProps) {
  const { fancy } = useFancyMode();
  const { isDark } = useTheme();

  const mdComponents = {
    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      const match = /language-(\w+)/.exec(className || "");
      return match ? (
        <SyntaxHighlighter style={isDark ? vscDarkPlus : vs} language={match[1]} PreTag="div" className="rounded my-1.5 text-xs">
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-bg-secondary text-accent-text rounded px-1 py-0.5 font-mono text-xs">
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
  };

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [noteOpen, setNoteOpen] = useState(!!note);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);
  const isUncategorized = chapter.id === "uncategorized";

  return (
    <div
      id={`chapter-${chapter.id}`}
      className={`rounded-xl border transition-all duration-200 animate-fade-in-up ${
        fancy ? "fancy-chapter-card" : ""
      } ${
        isActive
          ? fancy
            ? "border-accent/40 shadow-lg shadow-accent/10 bg-bg-secondary/30"
            : "border-accent/50 shadow-lg shadow-accent/10"
          : fancy
            ? "border-bd-primary/60 bg-bg-primary/50"
            : "border-bd-primary"
      } ${isUncategorized ? "border-amber-500/30" : ""} ${
        isReviewed ? "opacity-75" : ""
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={onActivate}
    >
      {/* Chapter header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Chapter number */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isUncategorized
                ? "bg-amber-500/20 text-amber-400"
                : isReviewed
                ? "bg-green-500/20 text-green-400"
                : "bg-accent/20 text-accent-text"
            }`}
          >
            {isUncategorized ? "!" : index + 1}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-t-primary">
                {chapter.title}
              </h3>
              <span className="text-xs text-t-tertiary flex-shrink-0">
                {chapter.hunks.length} change{chapter.hunks.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Connection to previous */}
            {chapter.connectionToPrevious && (
              <div className="text-sm text-t-tertiary mb-3 pl-3 border-l-2 border-bd-primary">
                <ReactMarkdown components={mdComponents}>
                  {chapter.connectionToPrevious}
                </ReactMarkdown>
              </div>
            )}

            {/* Narrative */}
            <div className="mb-4">
              <div className="text-sm text-t-secondary leading-relaxed">
                <ReactMarkdown components={mdComponents}>
                  {chapter.narrative}
                </ReactMarkdown>
              </div>
            </div>

            {/* Safety notes */}
            {chapter.safetyNotes && chapter.safetyNotes.length > 0 && (
              <div className="mb-4 space-y-1">
                {chapter.safetyNotes.map((note, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm"
                  >
                    {isUncategorized ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        isUncategorized ? "text-amber-300" : "text-green-300"
                      }
                    >
                      <ReactMarkdown components={{ ...mdComponents, p: ({ children }) => <span>{children}</span> }}>
                        {note}
                      </ReactMarkdown>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Action row */}
            <div className="flex items-center gap-4 mb-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="flex items-center gap-1.5 text-sm text-t-tertiary hover:text-t-primary transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                {expanded ? "Hide" : "Show"} code changes
              </button>
              {onNoteChange && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteOpen(!noteOpen);
                  }}
                  className={`flex items-center gap-1.5 text-sm transition-colors ${
                    note ? "text-amber-400 hover:text-amber-300" : "text-t-tertiary hover:text-t-secondary"
                  }`}
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  {note ? "Edit note" : "Add note"}
                </button>
              )}
            </div>

            {/* Chapter note */}
            {noteOpen && onNoteChange && (
              <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={note || ""}
                  onChange={(e) => onNoteChange(e.target.value)}
                  placeholder="Your notes on this chapter..."
                  className="w-full bg-bg-secondary/60 border border-bd-primary/50 rounded-lg px-3 py-2 text-sm text-t-primary placeholder-t-tertiary focus:outline-none focus:border-amber-500/40 resize-none"
                  rows={2}
                />
              </div>
            )}

            {/* Diff hunks */}
            {expanded && (
              <div className="space-y-2">
                {chapter.hunks.map((hunk, i) => (
                  <DiffView
                    key={`${hunk.file}-${hunk.hunkIndex}-${i}`}
                    diffContent={hunk.diffContent}
                    fileName={hunk.file}
                    annotation={hunk.annotation}
                    githubUrl={
                      prUrl ? `${prUrl}/files#diff-${encodeURIComponent(hunk.file)}` : undefined
                    }
                    settings={diffSettings}
                    fileContent={fileContents?.[hunk.file]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Review toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleReview();
            }}
            className="flex-shrink-0 p-1 hover:bg-bg-tertiary rounded-lg transition-colors"
            title={isReviewed ? "Mark as unreviewed" : "Mark as reviewed"}
          >
            {isReviewed ? (
              <CheckCircle2 className="w-6 h-6 text-green-400 animate-scale-check" />
            ) : (
              <Circle className="w-6 h-6 text-t-tertiary hover:text-t-tertiary transition-colors" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
