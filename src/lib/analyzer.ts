import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { ParsedDiff, Chapter, ChapterHunk, ModelId, AnalysisMetrics } from "./types";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL_PRICING: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
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
- Group tightly related cross-file changes together rather than showing them separately.`;

const narrativeOutputSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Human-readable PR title" },
    summary: { type: "string", description: "2-3 sentence overview of the entire PR" },
    rootCause: { type: "string", description: "One sentence describing the fundamental trigger" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          narrative: { type: "string" },
          connectionToPrevious: { type: "string" },
          safetyNotes: { type: "array", items: { type: "string" } },
          hunks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                hunkIndex: { type: "number" },
                annotation: { type: "string" },
              },
              required: ["file", "hunkIndex"],
            },
          },
        },
        required: ["id", "title", "narrative", "hunks"],
      },
    },
  },
  required: ["title", "summary", "rootCause", "chapters"],
} as const;

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
  const model = options.model || "claude-sonnet-4-6";
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

  const stream = getClient().messages.stream({
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
    output_config: {
      format: jsonSchemaOutputFormat(narrativeOutputSchema),
    },
  });

  const response = await stream.finalMessage();
  const durationMs = Date.now() - startTime;

  // SDK structured output: parsed_output is available when using output_config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any = (response as any).parsed_output;

  if (!parsed) {
    // Fallback: manually extract JSON from text content
    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        throw new Error("Claude did not return valid JSON. Response starts with: " + text.slice(0, 200));
      }
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }
  }

  const pricing = MODEL_PRICING[model];
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

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
