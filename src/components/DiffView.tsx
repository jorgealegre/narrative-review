"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { ExternalLink, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { DiffSettings, PRComment } from "@/lib/types";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";

function getLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    go: "go", py: "python", rb: "ruby", java: "java", cs: "csharp",
    cpp: "cpp", c: "c", rs: "rust", swift: "swift", kt: "kotlin",
    php: "php", sh: "bash", bash: "bash", yaml: "yaml", yml: "yaml",
    json: "json", md: "markdown", sql: "sql", css: "css",
    html: "xml", xml: "xml",
  };
  return map[ext] ?? "plaintext";
}

function highlightCode(code: string, language: string): string {
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return code;
  }
}

const EXPAND_STEP = 20;

interface DiffViewProps {
  diffContent: string;
  fileName: string;
  annotation?: string;
  githubUrl?: string;
  settings?: DiffSettings;
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

function InlineComment({ comment }: { comment: PRComment }) {
  return (
    <div className="bg-bg-tertiary/60 border-l-2 border-accent/50 mx-4 my-1 px-3 py-2 rounded-r-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-accent-text">{comment.author}</span>
        <span className="text-xs text-t-tertiary">
          {new Date(comment.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-t-secondary whitespace-pre-wrap">{comment.body}</p>
    </div>
  );
}

// ── Unified / Compact view ──────────────────────────────────────────────

function UnifiedDiffLines({
  lines,
  settings,
  prComments,
  language,
}: {
  lines: string[];
  settings: DiffSettings;
  prComments?: PRComment[];
  language: string;
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
    const matchedRemoveIdx = isDemoted ? wsAnalysis.addToRemove.get(lineIdx) : undefined;
    const demotedOldNum = matchedRemoveIdx !== undefined ? lineNumbers[matchedRemoveIdx]?.old : null;

    let bg = "";
    let textColor = "text-t-tertiary";
    if (isDemoted) {
      // ws-only
    } else if (type === "add") { bg = "bg-diff-add-bg"; textColor = "text-diff-add-text"; }
    else if (type === "remove") { bg = "bg-diff-remove-bg"; textColor = "text-diff-remove-text"; }
    else if (type === "header") { bg = "bg-diff-header-bg"; textColor = "text-diff-header-text"; }

    const displayLine = isDemoted ? " " + line.slice(1) : line;

    return (
      <div key={key}>
        <div className={`px-4 ${bg} ${textColor} font-mono flex items-center`}>
          <span className="w-8 text-right mr-1 text-bd-primary text-xs select-none flex-shrink-0">
            {isDemoted ? (demotedOldNum ?? "") : (nums.old ?? "")}
          </span>
          <span className="w-8 text-right mr-3 text-bd-primary text-xs select-none flex-shrink-0">
            {nums.new ?? ""}
          </span>
          <span className="select-none flex-shrink-0 w-4">{displayLine?.[0] ?? " "}</span>
          {type !== "header" ? (
            <span className="flex-1" dangerouslySetInnerHTML={{ __html: highlightCode(displayLine?.slice(1) ?? "", language) || " " }} />
          ) : (
            <span className="flex-1">{displayLine?.slice(1) || " "}</span>
          )}
        </div>
        {prComments && newLineNum !== null && prComments
          .filter((c) => c.line === newLineNum)
          .map((c) => <InlineComment key={c.id} comment={c} />)
        }
      </div>
    );
  }, [lines, wsAnalysis, lineNumbers, language, prComments]);

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
                className="w-full bg-bg-secondary/60 text-t-tertiary hover:text-t-secondary hover:bg-bg-tertiary/60 text-xs text-center py-0.5 border-y border-bd-primary/50 select-none flex items-center justify-center gap-1.5 transition-colors"
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
  language,
}: {
  lines: string[];
  settings: DiffSettings;
  language: string;
}) {
  const wsInfo = useMemo(
    () => settings.hideWhitespace
      ? analyzeWhitespaceChanges(lines)
      : { hidden: new Set<number>(), demoted: new Set<number>(), removeToAdd: new Map(), addToRemove: new Map() } as WsAnalysis,
    [lines, settings.hideWhitespace]
  );
  const pairs = useMemo(() => buildSplitPairs(lines, wsInfo), [lines, wsInfo]);

  return (
    <div className="grid grid-cols-2 divide-x divide-bd-primary">
      {/* Left (old) */}
      <div>
        {pairs.map((pair, i) => {
          if (pair.type === "header") {
            return (
              <div key={i} className="bg-diff-header-bg text-diff-header-text font-mono text-xs px-3 py-1 truncate">
                {pair.oldLine}
              </div>
            );
          }
          const hasOld = pair.oldLine !== null;
          const isRemove = hasOld && classifyLine(pair.oldLine!) === "remove";
          const oldContent = hasOld ? (pair.oldLine!.slice(1)) : "";
          const oldHighlighted = hasOld ? highlightCode(oldContent, language) : null;
          return (
            <div
              key={i}
              className={`font-mono flex items-center min-h-[1.5rem] text-sm text-t-secondary ${
                isRemove ? "bg-diff-remove-bg" : hasOld ? "" : "bg-bg-secondary/30"
              }`}
            >
              <span className="w-8 text-right mr-3 text-bd-primary text-xs select-none flex-shrink-0 px-1">
                {pair.oldNum ?? ""}
              </span>
              <span className="select-none flex-shrink-0 w-4">{hasOld ? (pair.oldLine?.[0] ?? " ") : ""}</span>
              <span className="flex-1 truncate px-2">
                {hasOld ? (oldHighlighted ? <span dangerouslySetInnerHTML={{ __html: oldHighlighted }} /> : pair.oldLine?.slice(1) || " ") : ""}
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
              <div key={i} className="bg-diff-header-bg text-diff-header-text font-mono text-xs px-3 py-1 truncate">
                {pair.newLine}
              </div>
            );
          }
          const hasNew = pair.newLine !== null;
          const isAdd = hasNew && classifyLine(pair.newLine!) === "add";
          const newContent = hasNew ? (pair.newLine!.slice(1)) : "";
          const newHighlighted = hasNew ? highlightCode(newContent, language) : null;
          return (
            <div
              key={i}
              className={`font-mono flex items-center min-h-[1.5rem] text-sm text-t-secondary ${
                isAdd ? "bg-diff-add-bg" : hasNew ? "" : "bg-bg-secondary/30"
              }`}
            >
              <span className="w-8 text-right mr-3 text-bd-primary text-xs select-none flex-shrink-0 px-1">
                {pair.newNum ?? ""}
              </span>
              <span className="select-none flex-shrink-0 w-4">{hasNew ? (pair.newLine?.[0] ?? " ") : ""}</span>
              <span className="flex-1 truncate px-2">
                {hasNew ? (newHighlighted ? <span dangerouslySetInnerHTML={{ __html: newHighlighted }} /> : pair.newLine?.slice(1) || " ") : ""}
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
}: {
  direction: "above" | "below";
  remaining: number;
  onClick: () => void;
}) {
  const count = Math.min(remaining, EXPAND_STEP);
  const Icon = direction === "above" ? ChevronUp : ChevronDown;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-t-tertiary hover:text-accent-text hover:bg-accent-muted transition-colors select-none border-bd-primary/50"
      style={{
        borderTopWidth: direction === "above" ? 0 : 1,
        borderBottomWidth: direction === "below" ? 0 : 1,
      }}
    >
      <Icon className="w-3 h-3" />
      {`Show ${count} more line${count !== 1 ? "s" : ""} ${direction}`}
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
          className="px-4 text-t-tertiary font-mono flex items-center bg-bg-primary/40"
        >
          <span className="w-8 text-right mr-1 text-bd-primary text-xs select-none flex-shrink-0">
            {num}
          </span>
          <span className="w-8 text-right mr-3 text-bd-primary text-xs select-none flex-shrink-0">
            {num}
          </span>
          <span className="select-none flex-shrink-0 w-4">{" "}</span>
          <span className="flex-1">{content || " "}</span>
        </div>
      ))}
    </>
  );
}

const DEFAULT_SETTINGS: DiffSettings = { hideWhitespace: false, viewMode: "unified" };

export function DiffView({
  diffContent,
  fileName,
  annotation,
  githubUrl,
  settings = DEFAULT_SETTINGS,
  comments,
  fileContent: fileContentProp,
}: DiffViewProps) {
  const [expandAbove, setExpandAbove] = useState(0);
  const [expandBelow, setExpandBelow] = useState(0);
  const [fileLines, setFileLines] = useState<string[] | null>(null);

  const language = useMemo(() => getLanguage(fileName), [fileName]);

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

  const handleExpandAbove = useCallback(() => {
    setExpandAbove((n) => n + EXPAND_STEP);
  }, []);

  const handleExpandBelow = useCallback(() => {
    setExpandBelow((n) => n + EXPAND_STEP);
  }, []);

  const { aboveStart, aboveEnd, belowStart, belowEnd, canExpandAbove, canExpandBelow } = useMemo(() => {
    if (!lineRange || !fileLines) {
      return {
        aboveStart: 0,
        aboveEnd: 0,
        belowStart: 0,
        belowEnd: 0,
        canExpandAbove: false,
        canExpandBelow: false,
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
  }, [lineRange, fileLines, expandAbove, expandBelow]);

  const remainingAbove = lineRange && fileLines
    ? lineRange.firstLine - 1 - expandAbove
    : 0;
  const remainingBelow = lineRange && fileLines
    ? fileLines.length - lineRange.lastLine - expandBelow
    : 0;

  return (
    <div className="rounded-lg border border-bd-primary overflow-hidden mb-3 group">
      <div className="bg-bg-secondary px-4 py-2 border-b border-bd-primary">
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono text-t-secondary">{fileName}</span>
          <div className="flex items-center gap-2">
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-t-tertiary hover:text-t-secondary"
                title="View on GitHub"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
        {annotation && (
          <p className="text-xs text-accent-text/80 mt-1">{annotation}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* Expand above */}
        {canExpandAbove && (
          <ExpandButton
            direction="above"
            remaining={Math.max(remainingAbove, 0)}
            onClick={handleExpandAbove}
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
          <SplitDiffView lines={lines} settings={settings} language={language} />
        ) : (
          <pre className="text-sm leading-6">
            <UnifiedDiffLines
              lines={lines}
              settings={settings}
              prComments={comments}
              language={language}
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
        {canExpandBelow && (
          <ExpandButton
            direction="below"
            remaining={Math.max(remainingBelow, 0)}
            onClick={handleExpandBelow}
          />
        )}
      </div>
    </div>
  );
}
