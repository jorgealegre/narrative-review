export interface PRInfo {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRef: string;
  headRef: string;
}

export interface DiffFile {
  path: string;
  status: "added" | "removed" | "modified" | "renamed";
  oldPath?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;
  lines: string[];
  rawContent: string;
  startLineOld: number;
  startLineNew: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  rawDiff: string;
}

export interface ChapterHunk {
  file: string;
  hunkIndex: number;
  diffContent: string;
  annotation?: string;
}

export interface Chapter {
  id: string;
  title: string;
  narrative: string;
  connectionToPrevious?: string;
  safetyNotes?: string[];
  hunks: ChapterHunk[];
}

export interface CoverageResult {
  totalFiles: number;
  coveredFiles: number;
  totalHunks: number;
  coveredHunks: number;
  uncoveredHunks: { file: string; hunkIndex: number; rawContent: string }[];
  isComplete: boolean;
}

export type ModelId =
  | "claude-sonnet-4-20250514"
  | "claude-opus-4-20250514"
  | "claude-3-5-haiku-20241022";

export interface AnalysisMetrics {
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
}

export interface NarrativeReview {
  prInfo: PRInfo;
  title: string;
  summary: string;
  rootCause: string;
  chapters: Chapter[];
  coverage: CoverageResult;
  metrics?: AnalysisMetrics;
  analyzedAt: string;
}

export interface ReviewState {
  prId: string;
  reviewedChapters: Record<string, boolean>;
  notes: Record<string, string>;
  startedAt: string;
  lastUpdatedAt: string;
}
