"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { ExternalLink, MessageSquare, MessageCircle, Send, Loader2, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { DiffSettings, PRComment } from "@/lib/types";

const EXPAND_STEP = 20;

interface DiffViewProps {
  diffContent: string;
  fileName: string;
  annotation?: string;
  githubUrl?: string;
  prInfo?: { owner: string; repo: string; number: number };
  settings?: DiffSettings;
  onAskAbout?: (question: string) => void;
  comments?: PRComment[];
  fileContent?: string;
}

function classifyLine(line: string): "add" | "remove" | "context" | "header" {
  if (line.startsWith("@@")) return "header";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

function parseHunkHeader(headerLine: string): { oldStart: number; newStart: number } | null {
  const match = headerLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
  if (!match) return null;
  return { oldStart: parseInt(match[1], 10), newStart: parseInt(match[2], 10) };
}

function getDiffNewLineRange(lines: string[]): { firstLine: number; lastLine: number } | null {
  let firstLine = -1;
  let currentLine = 0;
  let lastLine = 0;

  for (const line of lines) {
    const type = classifyLine(line);
    if (type === "header") {
      const parsed = parseHunkHeader(line);
      if (parsed) {
        if (firstLine === -1) firstLine = parsed.newStart;
        currentLine = parsed.newStart;
      }
    } else if (type === "add" || type === "context") {
      lastLine = currentLine;
      currentLine++;
    }
  }

  return firstLine >= 0 ? { firstLine, lastLine } : null;
}

interface WsAnalysis {
  hidden: Set<number>;
  demoted: Set<number>;
  removeToAdd: Map<number, number>;
  addToRemove: Map<number, number>;
}

/**
 * Analyzes remove/add blocks for whitespace-only changes and produces a
 * reordered display list that interleaves lines like GitHub does.
 *
 * For each change block, walks the old-file lines as the "spine":
 *  - Unmatched removes stay as red deletions
 *  - Matched (ws-only) removes are replaced by their add counterpart shown as context
 *  - Unmatched adds are inserted at the position of the first matched add that follows
 */
function analyzeWhitespaceChanges(lines: string[]): WsAnalysis {
  const hidden = new Set<number>();
  const demoted = new Set<number>();
  const removeToAdd = new Map<number, number>();
  const addToRemove = new Map<number, number>();
  let i = 0;

  while (i < lines.length) {
    const type = classifyLine(lines[i]);

    if (type === "remove") {
      const removeStart = i;
      while (i < lines.length && classifyLine(lines[i]) === "remove") i++;
      const addStart = i;
      while (i < lines.length && classifyLine(lines[i]) === "add") i++;
      const addEnd = i;

      const addUsed = new Set<number>();
      for (let r = removeStart; r < addStart; r++) {
        const rTrimmed = lines[r].slice(1).trim();
        if (rTrimmed === "") { hidden.add(r); continue; }
        for (let a = addStart; a < addEnd; a++) {
          if (addUsed.has(a)) continue;
          if (lines[a].slice(1).trim() === rTrimmed) {
            hidden.add(r);
            demoted.add(a);
            removeToAdd.set(r, a);
            addToRemove.set(a, r);
            addUsed.add(a);
            break;
          }
        }
      }
      for (let a = addStart; a < addEnd; a++) {
        if (!addUsed.has(a) && lines[a].slice(1).trim() === "") {
          hidden.add(a);
        }
      }
    } else if (type === "add" && lines[i].slice(1).trim() === "") {
      hidden.add(i);
      i++;
    } else {
      i++;
    }
  }
  return { hidden, demoted, removeToAdd, addToRemove };
}

/**
 * Produces a reordered index array that interleaves removes/adds within change
 * blocks so that whitespace-only matched pairs appear as context at their
 * logical position (matching GitHub's "Hide whitespace" behavior).
 */
function buildWhitespaceAwareOrder(lines: string[], ws: WsAnalysis): number[] {
  const order: number[] = [];
  let i = 0;

  while (i < lines.length) {
    const type = classifyLine(lines[i]);

    if (type !== "remove") {
      if (!ws.hidden.has(i)) order.push(i);
      i++;
      continue;
    }

    // Collect the full change block
    const removeStart = i;
    while (i < lines.length && classifyLine(lines[i]) === "remove") i++;
    const addStart = i;
    while (i < lines.length && classifyLine(lines[i]) === "add") i++;
    const addEnd = i;

    // Walk removes as the spine, inserting unmatched adds at the right spots
    const addEmitted = new Set<number>();

    for (let r = removeStart; r < addStart; r++) {
      if (ws.hidden.has(r) && ws.removeToAdd.has(r)) {
        const matchedAdd = ws.removeToAdd.get(r)!;
        // Emit any unmatched adds that precede this matched add
        for (let a = addStart; a < matchedAdd; a++) {
          if (addEmitted.has(a) || ws.hidden.has(a)) continue;
          order.push(a);
          addEmitted.add(a);
        }
        if (!addEmitted.has(matchedAdd)) {
          order.push(matchedAdd);
          addEmitted.add(matchedAdd);
        }
      } else if (!ws.hidden.has(r)) {
        order.push(r);
      }
    }

    // Emit remaining adds
    for (let a = addStart; a < addEnd; a++) {
      if (!addEmitted.has(a) && !ws.hidden.has(a)) {
        order.push(a);
        addEmitted.add(a);
      }
    }
  }

  return order;
}

interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function CommentForm({ onSubmit, onCancel, loading }: CommentFormProps) {
  const [text, setText] = useState("");

  return (
    <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg mx-4 my-1 p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 resize-none"
        rows={3}
        autoFocus
        disabled={loading}
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          onClick={() => text.trim() && onSubmit(text.trim())}
          disabled={!text.trim() || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Comment on GitHub
        </button>
      </div>
    </div>
  );
}

function InlineComment({ comment }: { comment: PRComment }) {
  return (
    <div className="bg-zinc-800/60 border-l-2 border-indigo-500/50 mx-4 my-1 px-3 py-2 rounded-r-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-indigo-300">{comment.author}</span>
        <span className="text-xs text-zinc-600">
          {new Date(comment.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-zinc-300 whitespace-pre-wrap">{comment.body}</p>
    </div>
  );
}

// ── Unified / Compact view ──────────────────────────────────────────────

function UnifiedDiffLines({
  lines,
  settings,
  prInfo,
  fileName,
  commentLine,
  setCommentLine,
  commentLoading,
  postedComments,
  handleComment,
  prComments,
}: {
  lines: string[];
  settings: DiffSettings;
  prInfo?: { owner: string; repo: string; number: number };
  fileName: string;
  commentLine: number | null;
  setCommentLine: (v: number | null) => void;
  commentLoading: boolean;
  postedComments: Set<number>;
  handleComment: (body: string) => Promise<void>;
  prComments?: PRComment[];
}) {
  const emptyWs: WsAnalysis = useMemo(() => ({
    hidden: new Set<number>(), demoted: new Set<number>(),
    removeToAdd: new Map(), addToRemove: new Map(),
  }), []);

  const wsAnalysis = useMemo(
    () => settings.hideWhitespace ? analyzeWhitespaceChanges(lines) : emptyWs,
    [lines, settings.hideWhitespace, emptyWs]
  );

  const lineNumbers = useMemo(() => {
    let currentOld = 0;
    let currentNew = 0;
    return lines.map((line) => {
      const type = classifyLine(line);
      if (type === "header") {
        const parsed = parseHunkHeader(line);
        if (parsed) {
          currentOld = parsed.oldStart;
          currentNew = parsed.newStart;
        }
        return { old: null, new: null };
      }
      if (type === "remove") {
        const num = currentOld;
        currentOld++;
        return { old: num, new: null };
      }
      if (type === "add") {
        const num = currentNew;
        currentNew++;
        return { old: null, new: num };
      }
      const o = currentOld;
      const n = currentNew;
      currentOld++;
      currentNew++;
      return { old: o, new: n };
    });
  }, [lines]);

  const visibleIndices = useMemo(() => {
    // When hiding whitespace, use the interleaved order
    const baseOrder = settings.hideWhitespace
      ? buildWhitespaceAwareOrder(lines, wsAnalysis)
      : lines.map((_, i) => i).filter((i) => !wsAnalysis.hidden.has(i));

    if (settings.viewMode !== "compact") return baseOrder;

    // In compact mode, collapse runs of context to at most 2 around changes
    const effectiveType = (idx: number) => {
      if (wsAnalysis.demoted.has(idx)) return "context";
      return classifyLine(lines[idx]);
    };

    const contextBoundary = 2;
    const changePositions = new Set<number>();
    baseOrder.forEach((idx, pos) => {
      const et = effectiveType(idx);
      if (et !== "context" && et !== "header") changePositions.add(pos);
      if (classifyLine(lines[idx]) === "header") changePositions.add(pos);
    });

    return baseOrder.filter((idx, pos) => {
      if (changePositions.has(pos)) return true;
      if (classifyLine(lines[idx]) === "header") return true;
      for (let p = Math.max(0, pos - contextBoundary); p <= Math.min(baseOrder.length - 1, pos + contextBoundary); p++) {
        if (changePositions.has(p)) return true;
      }
      return false;
    });
  }, [lines, settings.viewMode, settings.hideWhitespace, wsAnalysis]);

  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set());
  const toggleGap = useCallback((posIdx: number) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(posIdx)) next.delete(posIdx);
      else next.add(posIdx);
      return next;
    });
  }, []);

  const renderLine = useCallback((lineIdx: number, key: string) => {
    const line = lines[lineIdx];
    const type = classifyLine(line);
    const isDemoted = wsAnalysis.demoted.has(lineIdx);
    const nums = lineNumbers[lineIdx];
    const newLineNum = nums.new;
    const canComment = prInfo && newLineNum !== null && type !== "header";
    const hasComment = newLineNum !== null && postedComments.has(newLineNum);
    const matchedRemoveIdx = isDemoted ? wsAnalysis.addToRemove.get(lineIdx) : undefined;
    const demotedOldNum = matchedRemoveIdx !== undefined ? lineNumbers[matchedRemoveIdx]?.old : null;

    let bg = "";
    let textColor = "text-zinc-400";
    if (isDemoted) {
      // ws-only
    } else if (type === "add") { bg = "bg-green-950/40"; textColor = "text-green-300"; }
    else if (type === "remove") { bg = "bg-red-950/40"; textColor = "text-red-300"; }
    else if (type === "header") { bg = "bg-blue-950/30"; textColor = "text-blue-400"; }

    const displayLine = isDemoted ? " " + line.slice(1) : line;

    return (
      <div key={key}>
        <div
          className={`px-4 ${bg} ${textColor} font-mono flex items-center group/line ${
            canComment ? "cursor-pointer hover:brightness-125" : ""
          }`}
          onClick={() => {
            if (canComment && newLineNum !== null) {
              setCommentLine(commentLine === newLineNum ? null : newLineNum);
            }
          }}
        >
          <span className="w-8 text-right mr-1 text-zinc-700 text-xs select-none flex-shrink-0">
            {isDemoted ? (demotedOldNum ?? "") : (nums.old ?? "")}
          </span>
          <span className="w-8 text-right mr-3 text-zinc-700 text-xs select-none flex-shrink-0">
            {nums.new ?? ""}
          </span>
          <span className="select-none flex-shrink-0 w-4">{displayLine?.[0] ?? " "}</span><span className="flex-1">{displayLine?.slice(1) || " "}</span>
          {canComment && (
            <span className="opacity-0 group-hover/line:opacity-100 transition-opacity ml-2 flex-shrink-0">
              {hasComment ? (
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
              )}
            </span>
          )}
        </div>
        {commentLine === newLineNum && newLineNum !== null && (
          <CommentForm
            onSubmit={handleComment}
            onCancel={() => setCommentLine(null)}
            loading={commentLoading}
          />
        )}
        {prComments && newLineNum !== null && prComments
          .filter((c) => c.line === newLineNum)
          .map((c) => <InlineComment key={c.id} comment={c} />)
        }
      </div>
    );
  }, [lines, wsAnalysis, lineNumbers, prInfo, postedComments, commentLine, setCommentLine, commentLoading, handleComment, prComments]);

  return (
    <>
      {visibleIndices.map((i, posIdx) => {
        const prevI = posIdx > 0 ? visibleIndices[posIdx - 1] : -1;
        const hasGap = posIdx > 0 && i - prevI > 1 && settings.viewMode === "compact";
        const gapExpanded = expandedGaps.has(posIdx);
        const hiddenCount = hasGap ? i - prevI - 1 : 0;

        const hiddenLines: number[] = [];
        if (hasGap && gapExpanded) {
          for (let h = prevI + 1; h < i; h++) {
            if (!wsAnalysis.hidden.has(h)) hiddenLines.push(h);
          }
        }

        return (
          <div key={`${i}-${posIdx}`}>
            {hasGap && (
              <button
                onClick={() => toggleGap(posIdx)}
                className="w-full bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 text-xs text-center py-0.5 border-y border-zinc-800/50 select-none flex items-center justify-center gap-1.5 transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3" />
                {gapExpanded ? "Collapse" : `Show ${hiddenCount} hidden lines`}
              </button>
            )}
            {hiddenLines.map(h => renderLine(h, `gap-${posIdx}-${h}`))}
            {renderLine(i, `line-${i}`)}
          </div>
        );
      })}
    </>
  );
}

// ── Split (side-by-side) view ───────────────────────────────────────────

interface SplitPair {
  oldLine: string | null;
  newLine: string | null;
  oldNum: number | null;
  newNum: number | null;
  type: "context" | "change" | "header";
}

function buildSplitPairs(
  lines: string[],
  wsInfo: { hidden: Set<number>; demoted: Set<number> }
): SplitPair[] {
  const pairs: SplitPair[] = [];
  let oldNum = 0;
  let newNum = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const type = classifyLine(line);

    if (type === "header") {
      const parsed = parseHunkHeader(line);
      if (parsed) { oldNum = parsed.oldStart; newNum = parsed.newStart; }
      pairs.push({ oldLine: line, newLine: line, oldNum: null, newNum: null, type: "header" });
      i++;
      continue;
    }

    if (type === "context") {
      if (!wsInfo.hidden.has(i)) {
        pairs.push({ oldLine: line, newLine: line, oldNum: oldNum, newNum: newNum, type: "context" });
      }
      oldNum++;
      newNum++;
      i++;
      continue;
    }

    const removes: { line: string; num: number; idx: number }[] = [];
    const adds: { line: string; num: number; idx: number }[] = [];

    while (i < lines.length && classifyLine(lines[i]) === "remove") {
      removes.push({ line: lines[i], num: oldNum, idx: i });
      oldNum++;
      i++;
    }
    while (i < lines.length && classifyLine(lines[i]) === "add") {
      adds.push({ line: lines[i], num: newNum, idx: i });
      newNum++;
      i++;
    }

    const maxLen = Math.max(removes.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      const rm = j < removes.length ? removes[j] : null;
      const ad = j < adds.length ? adds[j] : null;

      // Both hidden: skip entirely
      if (rm && wsInfo.hidden.has(rm.idx) && ad && wsInfo.hidden.has(ad.idx)) continue;
      // Remove hidden + add demoted: show as context
      if (rm && wsInfo.hidden.has(rm.idx) && ad && wsInfo.demoted.has(ad.idx)) {
        const ctxLine = " " + ad.line.slice(1);
        pairs.push({ oldLine: ctxLine, newLine: ctxLine, oldNum: rm.num, newNum: ad.num, type: "context" });
        continue;
      }
      // Remove hidden only (unmatched): skip
      if (rm && wsInfo.hidden.has(rm.idx) && !ad) continue;

      pairs.push({
        oldLine: rm && !wsInfo.hidden.has(rm.idx) ? rm.line : null,
        newLine: ad && !wsInfo.hidden.has(ad.idx) ? ad.line : null,
        oldNum: rm && !wsInfo.hidden.has(rm.idx) ? rm.num : null,
        newNum: ad ? ad.num : null,
        type: "change",
      });
    }
  }
  return pairs;
}

function SplitDiffView({
  lines,
  settings,
}: {
  lines: string[];
  settings: DiffSettings;
}) {
  const wsInfo = useMemo(
    () => settings.hideWhitespace
      ? analyzeWhitespaceChanges(lines)
      : { hidden: new Set<number>(), demoted: new Set<number>(), removeToAdd: new Map(), addToRemove: new Map() } as WsAnalysis,
    [lines, settings.hideWhitespace]
  );
  const pairs = useMemo(() => buildSplitPairs(lines, wsInfo), [lines, wsInfo]);

  return (
    <div className="grid grid-cols-2 divide-x divide-zinc-800">
      {/* Left (old) */}
      <div>
        {pairs.map((pair, i) => {
          if (pair.type === "header") {
            return (
              <div key={i} className="bg-blue-950/30 text-blue-400 font-mono text-xs px-3 py-1 truncate">
                {pair.oldLine}
              </div>
            );
          }
          const hasOld = pair.oldLine !== null;
          const isRemove = hasOld && classifyLine(pair.oldLine!) === "remove";
          return (
            <div
              key={i}
              className={`font-mono flex items-center min-h-[1.5rem] text-sm ${
                isRemove
                  ? "bg-red-950/40 text-red-300"
                  : hasOld
                  ? "text-zinc-400"
                  : "bg-zinc-900/30"
              }`}
            >
              <span className="w-8 text-right mr-3 text-zinc-700 text-xs select-none flex-shrink-0 px-1">
                {pair.oldNum ?? ""}
              </span>
              <span className="select-none flex-shrink-0 w-4">{hasOld ? (pair.oldLine?.[0] ?? " ") : ""}</span>
              <span className="flex-1 truncate px-2">
                {hasOld ? pair.oldLine?.slice(1) || " " : ""}
              </span>
            </div>
          );
        })}
      </div>
      {/* Right (new) */}
      <div>
        {pairs.map((pair, i) => {
          if (pair.type === "header") {
            return (
              <div key={i} className="bg-blue-950/30 text-blue-400 font-mono text-xs px-3 py-1 truncate">
                {pair.newLine}
              </div>
            );
          }
          const hasNew = pair.newLine !== null;
          const isAdd = hasNew && classifyLine(pair.newLine!) === "add";
          return (
            <div
              key={i}
              className={`font-mono flex items-center min-h-[1.5rem] text-sm ${
                isAdd
                  ? "bg-green-950/40 text-green-300"
                  : hasNew
                  ? "text-zinc-400"
                  : "bg-zinc-900/30"
              }`}
            >
              <span className="w-8 text-right mr-3 text-zinc-700 text-xs select-none flex-shrink-0 px-1">
                {pair.newNum ?? ""}
              </span>
              <span className="select-none flex-shrink-0 w-4">{hasNew ? (pair.newLine?.[0] ?? " ") : ""}</span>
              <span className="flex-1 truncate px-2">
                {hasNew ? pair.newLine?.slice(1) || " " : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Expand context lines ────────────────────────────────────────────────

function ExpandButton({
  direction,
  remaining,
  onClick,
  loading,
}: {
  direction: "above" | "below";
  remaining: number;
  onClick: () => void;
  loading?: boolean;
}) {
  const count = Math.min(remaining, EXPAND_STEP);
  const Icon = direction === "above" ? ChevronUp : ChevronDown;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/5 transition-colors select-none border-zinc-800/50"
      style={{
        borderTopWidth: direction === "above" ? 0 : 1,
        borderBottomWidth: direction === "below" ? 0 : 1,
      }}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {loading ? "Loading file…" : `Show ${count} more line${count !== 1 ? "s" : ""} ${direction}`}
    </button>
  );
}

function ExpandedContextLines({
  fileLines,
  startLine,
  endLine,
}: {
  fileLines: string[];
  startLine: number;
  endLine: number;
}) {
  const linesToRender: { num: number; content: string }[] = [];
  for (let i = startLine; i <= endLine; i++) {
    if (i >= 1 && i <= fileLines.length) {
      linesToRender.push({ num: i, content: fileLines[i - 1] });
    }
  }

  return (
    <>
      {linesToRender.map(({ num, content }) => (
        <div
          key={`expanded-${num}`}
          className="px-4 text-zinc-500 font-mono flex items-center bg-zinc-950/40"
        >
          <span className="w-8 text-right mr-1 text-zinc-700 text-xs select-none flex-shrink-0">
            {num}
          </span>
          <span className="w-8 text-right mr-3 text-zinc-700 text-xs select-none flex-shrink-0">
            {num}
          </span>
          <span className="select-none flex-shrink-0 w-4">{" "}</span>
          <span className="flex-1">{content || " "}</span>
        </div>
      ))}
    </>
  );
}

// ── File content cache (shared across DiffView instances) ───────────────

const fileContentCache = new Map<string, string[]>();

function cacheKeyForFile(owner: string, repo: string, number: number, path: string) {
  return `${owner}/${repo}#${number}:${path}`;
}

// ── Main DiffView ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS: DiffSettings = { hideWhitespace: false, viewMode: "unified" };

export function DiffView({
  diffContent,
  fileName,
  annotation,
  githubUrl,
  prInfo,
  settings = DEFAULT_SETTINGS,
  onAskAbout,
  comments,
  fileContent: fileContentProp,
}: DiffViewProps) {
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [postedComments, setPostedComments] = useState<Set<number>>(new Set());
  const [expandAbove, setExpandAbove] = useState(0);
  const [expandBelow, setExpandBelow] = useState(0);
  const [fileLines, setFileLines] = useState<string[] | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const lines = useMemo(() => {
    return diffContent.split("\n").filter((l) => {
      if (l.startsWith("diff --git")) return false;
      if (l.startsWith("index ")) return false;
      if (l.startsWith("---")) return false;
      if (l.startsWith("+++")) return false;
      if (l.startsWith("new file")) return false;
      if (l.startsWith("deleted file")) return false;
      if (l.startsWith("similarity index")) return false;
      if (l.startsWith("rename from")) return false;
      if (l.startsWith("rename to")) return false;
      return true;
    });
  }, [diffContent]);

  const lineRange = useMemo(() => getDiffNewLineRange(lines), [lines]);

  useEffect(() => {
    if (fileContentProp) {
      setFileLines(fileContentProp.split("\n"));
    }
  }, [fileContentProp]);

  const fetchFileContent = useCallback(async () => {
    if (fileLines || loadingFile || !prInfo) return;

    const key = cacheKeyForFile(prInfo.owner, prInfo.repo, prInfo.number, fileName);
    const cached = fileContentCache.get(key);
    if (cached) {
      setFileLines(cached);
      return;
    }

    setLoadingFile(true);
    try {
      const params = new URLSearchParams({
        owner: prInfo.owner,
        repo: prInfo.repo,
        number: String(prInfo.number),
        path: fileName,
      });
      const res = await fetch(`/api/file-content?${params}`);
      if (res.ok) {
        const { content } = await res.json();
        const split = (content as string).split("\n");
        fileContentCache.set(key, split);
        setFileLines(split);
      }
    } catch {
      // silently fail - expand buttons will just not appear
    } finally {
      setLoadingFile(false);
    }
  }, [fileLines, loadingFile, prInfo, fileName]);

  const handleExpandAbove = useCallback(() => {
    if (!fileLines && !loadingFile) {
      fetchFileContent().then(() => {
        setExpandAbove((n) => n + EXPAND_STEP);
      });
    } else {
      setExpandAbove((n) => n + EXPAND_STEP);
    }
  }, [fileLines, loadingFile, fetchFileContent]);

  const handleExpandBelow = useCallback(() => {
    if (!fileLines && !loadingFile) {
      fetchFileContent().then(() => {
        setExpandBelow((n) => n + EXPAND_STEP);
      });
    } else {
      setExpandBelow((n) => n + EXPAND_STEP);
    }
  }, [fileLines, loadingFile, fetchFileContent]);

  const { aboveStart, aboveEnd, belowStart, belowEnd, canExpandAbove, canExpandBelow } = useMemo(() => {
    if (!lineRange || !fileLines) {
      const hasSource = !!prInfo || !!fileContentProp;
      return {
        aboveStart: 0,
        aboveEnd: 0,
        belowStart: 0,
        belowEnd: 0,
        canExpandAbove: hasSource && !!lineRange && lineRange.firstLine > 1,
        canExpandBelow: hasSource && !!lineRange,
      };
    }

    const totalFileLines = fileLines.length;
    const aboveAvailable = lineRange.firstLine - 1;
    const belowAvailable = totalFileLines - lineRange.lastLine;

    const showAbove = Math.min(expandAbove, aboveAvailable);
    const showBelow = Math.min(expandBelow, belowAvailable);

    return {
      aboveStart: lineRange.firstLine - showAbove,
      aboveEnd: lineRange.firstLine - 1,
      belowStart: lineRange.lastLine + 1,
      belowEnd: lineRange.lastLine + showBelow,
      canExpandAbove: expandAbove < aboveAvailable,
      canExpandBelow: expandBelow < belowAvailable,
    };
  }, [lineRange, fileLines, expandAbove, expandBelow, prInfo, fileContentProp]);

  const handleComment = async (body: string) => {
    if (!prInfo || commentLine === null) return;
    setCommentLoading(true);
    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: prInfo.owner,
          repo: prInfo.repo,
          number: prInfo.number,
          path: fileName,
          line: commentLine,
          body,
        }),
      });
      if (res.ok) {
        setPostedComments((prev) => new Set([...prev, commentLine]));
        setCommentLine(null);
      }
    } finally {
      setCommentLoading(false);
    }
  };

  const remainingAbove = lineRange
    ? (fileLines ? lineRange.firstLine - 1 - expandAbove : lineRange.firstLine - 1)
    : 0;
  const remainingBelow = lineRange && fileLines
    ? fileLines.length - lineRange.lastLine - expandBelow
    : EXPAND_STEP;

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden mb-3 group">
      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono text-zinc-300">{fileName}</span>
          <div className="flex items-center gap-2">
            {onAskAbout && (
              <button
                onClick={() => {
                  const snippet = diffContent.split("\n").slice(0, 30).join("\n");
                  onAskAbout(
                    `Explain this code change in ${fileName}:\n\n\`\`\`\n${snippet}\n\`\`\`\n${annotation ? `\nThe annotation says: "${annotation}"` : ""}\n\nWhat exactly is happening here and why?`
                  );
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-indigo-400"
                title="Ask about this code"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
                title="View on GitHub"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
        {annotation && (
          <p className="text-xs text-indigo-300/80 mt-1">{annotation}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* Expand above */}
        {canExpandAbove && (
          <ExpandButton
            direction="above"
            remaining={Math.max(remainingAbove, 0)}
            onClick={handleExpandAbove}
            loading={loadingFile}
          />
        )}

        {/* Expanded lines above the diff */}
        {fileLines && expandAbove > 0 && aboveStart <= aboveEnd && (
          <pre className="text-sm leading-6">
            <ExpandedContextLines
              fileLines={fileLines}
              startLine={aboveStart}
              endLine={aboveEnd}
            />
          </pre>
        )}

        {settings.viewMode === "split" ? (
          <SplitDiffView lines={lines} settings={settings} />
        ) : (
          <pre className="text-sm leading-6">
            <UnifiedDiffLines
              lines={lines}
              settings={settings}
              prInfo={prInfo}
              fileName={fileName}
              commentLine={commentLine}
              setCommentLine={setCommentLine}
              commentLoading={commentLoading}
              postedComments={postedComments}
              handleComment={handleComment}
              prComments={comments}
            />
          </pre>
        )}

        {/* Expanded lines below the diff */}
        {fileLines && expandBelow > 0 && belowStart <= belowEnd && (
          <pre className="text-sm leading-6">
            <ExpandedContextLines
              fileLines={fileLines}
              startLine={belowStart}
              endLine={belowEnd}
            />
          </pre>
        )}

        {/* Expand below */}
        {(canExpandBelow || (!fileLines && lineRange)) && (
          <ExpandButton
            direction="below"
            remaining={Math.max(remainingBelow, 0)}
            onClick={handleExpandBelow}
            loading={loadingFile}
          />
        )}
      </div>
    </div>
  );
}
