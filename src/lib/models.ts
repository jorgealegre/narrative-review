// The one list of models the review can run on. Prices are USD per million
// tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// (read 2026-10-12).
//
// `tokensPerByte` feeds the pre-flight cost estimate only: models from 4.7 on
// use a tokenizer that produces about 30% more tokens for the same text.
export const MODELS = {
  "claude-haiku-4-5-20251001": { label: "Haiku 4.5", input: 1.0, output: 5.0, tokensPerByte: 0.25 },
  "claude-sonnet-4-6": { label: "Sonnet 4.6", input: 3.0, output: 15.0, tokensPerByte: 0.25 },
  "claude-opus-4-6": { label: "Opus 4.6", input: 5.0, output: 25.0, tokensPerByte: 0.25 },
  // Haiku 5.5 costs 0.50 / 2.50 on prompts over 100,000 tokens; the default
  // max-diff-size keeps a review under that, so the lower tier is used.
  "claude-haiku-5-5": { label: "Haiku 5.5", input: 0.1, output: 0.5, tokensPerByte: 0.325 },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", input: 2.0, output: 10.0, tokensPerByte: 0.325 },
  "claude-opus-5-5": { label: "Opus 5.5", input: 4.0, output: 20.0, tokensPerByte: 0.325 },
} as const;

export type ModelId = keyof typeof MODELS;

export const DEFAULT_MODEL: ModelId = "claude-sonnet-5-5";

export function isModelId(value: string): value is ModelId {
  return Object.hasOwn(MODELS, value);
}

/** Resolves a user-supplied model, falling back to the default when empty. Throws on an unknown id. */
export function resolveModel(value: string | undefined): ModelId {
  if (!value) return DEFAULT_MODEL;
  if (isModelId(value)) return value;
  throw new Error(
    `Unknown model "${value}". Known models: ${Object.keys(MODELS).join(", ")}.`
  );
}

export function costOf(model: ModelId, inputTokens: number, outputTokens: number): number {
  const { input, output } = MODELS[model];
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

// System prompt tokens and a typical narrative's output, for the estimate.
const SYSTEM_PROMPT_TOKENS = 3000;
const TYPICAL_OUTPUT_TOKENS = 4000;

/** Cost guess from the diff's size alone, made before calling Claude. */
export function estimateCost(model: ModelId, diffBytes: number): number {
  const scale = MODELS[model].tokensPerByte / 0.25;
  const inputTokens = Math.ceil(diffBytes * MODELS[model].tokensPerByte) + SYSTEM_PROMPT_TOKENS * scale;
  return costOf(model, inputTokens, TYPICAL_OUTPUT_TOKENS * scale);
}
