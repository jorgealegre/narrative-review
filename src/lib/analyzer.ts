import Anthropic from "@anthropic-ai/sdk";
import { ParsedDiff, Chapter, ChapterHunk, ModelId, AnalysisMetrics } from "./types";

const client = new Anthropic();

const MODEL_PRICING: Record<ModelId, { input: number; output: number }> = {
  "claude-3-5-haiku-20241022": { input: 0.80, output: 4.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
};

function buildFileManifest(diff: ParsedDiff): string {
  return diff.files
    .map(
      (f) =>
        `- ${f.path} [${f.status}] (+${f.additions}/-${f.deletions}, ${f.hunks.length} hunks)`
    )
    .join("\n");
}

function buildHunkReference(diff: ParsedDiff): string {
  const parts: string[] = [];
  for (const file of diff.files) {
    for (let i = 0; i < file.hunks.length; i++) {
      parts.push(`=== FILE: ${file.path} | HUNK ${i} ===`);
      parts.push(file.hunks[i].rawContent);
      parts.push("");
    }
  }
  return parts.join("\n");
}

const SYSTEM_PROMPT = `You are a senior code reviewer who excels at understanding the causal structure of code changes. Your job is to analyze a pull request diff and organize the changes into a **narrative** — a story that a reviewer can follow from root cause to cascading effects.

## Your Task

Given a PR diff, you must:

1. **Identify the root trigger** — the fundamental change that caused everything else (e.g., a feature flag removal, an API change, a protocol deletion).

2. **Trace the dependency chain** — understand which changes are consequences of other changes. If a view was deleted, find the call site that was changed/removed. If a function was removed, find where it was being called.

3. **Group into chapters** — cluster related changes across files into logical units. A chapter might span multiple files if they're all about the same logical change (e.g., "removing the legacy data loader" might touch a reducer, a client, and a model file).

4. **Order chapters causally** — root cause first, then direct consequences, then cascading effects, then leaf cleanup (like deleted files with no remaining references).

5. **Write narrative transitions** — for each chapter, explain what's happening and how it connects to the previous chapter.

6. **Annotate safety** — for deletions, explain why they're safe (e.g., "This view's only call site was in the conditional branch removed in Chapter 2").

## Rules

- Every hunk from the diff MUST appear in exactly one chapter. Reference hunks by file path and hunk index (0-based).
- Chapters should be ordered so a reviewer never sees a deletion before understanding why it's being deleted.
- Keep narrative text concise but informative. Write like a knowledgeable colleague explaining the PR over coffee.
- If a change is straightforward (e.g., fixing a typo, updating an import), it can be a brief chapter.
- Group tightly related cross-file changes together rather than showing them separately.

## Output Format

Return valid JSON (no markdown fences) matching this structure:

{
  "title": "Human-readable PR title",
  "summary": "2-3 sentence overview of the entire PR",
  "rootCause": "One sentence describing the fundamental trigger",
  "chapters": [
    {
      "id": "ch-1",
      "title": "Chapter title",
      "narrative": "Explanation paragraph",
      "connectionToPrevious": "How this relates to the previous chapter (omit for first chapter)",
      "safetyNotes": ["Optional safety annotations for deletions"],
      "hunks": [
        {
          "file": "path/to/file.swift",
          "hunkIndex": 0,
          "annotation": "Optional per-hunk note"
        }
      ]
    }
  ]
}`;

interface AnalyzeOptions {
  model?: ModelId;
}

export async function analyzeNarrative(
  diff: ParsedDiff,
  prTitle: string,
  prBody: string,
  options: AnalyzeOptions = {}
): Promise<{
  title: string;
  summary: string;
  rootCause: string;
  chapters: Chapter[];
  metrics: AnalysisMetrics;
}> {
  const model = options.model || "claude-sonnet-4-20250514";
  const manifest = buildFileManifest(diff);
  const hunks = buildHunkReference(diff);

  const userPrompt = `## Pull Request
Title: ${prTitle}
Description: ${prBody || "(no description)"}

## File Manifest
${manifest}

## All Hunks (reference by file + hunk index)
${hunks}

Analyze this diff and return the narrative JSON.`;

  const startTime = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const durationMs = Date.now() - startTime;

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const pricing = MODEL_PRICING[model];
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  const parsed = JSON.parse(text);

  const chapters: Chapter[] = parsed.chapters.map(
    (ch: {
      id: string;
      title: string;
      narrative: string;
      connectionToPrevious?: string;
      safetyNotes?: string[];
      hunks: { file: string; hunkIndex: number; annotation?: string }[];
    }) => ({
      id: ch.id,
      title: ch.title,
      narrative: ch.narrative,
      connectionToPrevious: ch.connectionToPrevious,
      safetyNotes: ch.safetyNotes,
      hunks: ch.hunks.map(
        (h): ChapterHunk => {
          const file = diff.files.find((f) => f.path === h.file);
          const hunk = file?.hunks[h.hunkIndex];
          return {
            file: h.file,
            hunkIndex: h.hunkIndex,
            diffContent:
              hunk?.rawContent ||
              `[hunk not found: ${h.file}#${h.hunkIndex}]`,
            annotation: h.annotation,
          };
        }
      ),
    })
  );

  return {
    title: parsed.title,
    summary: parsed.summary,
    rootCause: parsed.rootCause,
    chapters,
    metrics: { model, inputTokens, outputTokens, cost, durationMs },
  };
}
