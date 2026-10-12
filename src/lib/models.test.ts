import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, costOf, estimateCost, resolveModel } from "./models";

describe("models", () => {
  it("defaults to Sonnet 5.5", () => {
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
    expect(resolveModel("")).toBe("claude-sonnet-5-5");
    expect(resolveModel(undefined)).toBe("claude-sonnet-5-5");
  });

  it("keeps the models earlier releases accepted", () => {
    for (const id of ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"]) {
      expect(resolveModel(id)).toBe(id);
    }
  });

  it("rejects an unknown model and lists the known ones", () => {
    expect(() => resolveModel("claude-sonnet-9")).toThrow(/Unknown model "claude-sonnet-9"/);
    expect(() => resolveModel("claude-sonnet-9")).toThrow(/claude-sonnet-5-5/);
    expect(() => resolveModel("toString")).toThrow(/Unknown model/);
  });

  it("prices Sonnet 5.5 at 2 and 10 USD per million tokens", () => {
    expect(MODELS["claude-sonnet-5-5"]).toMatchObject({ input: 2, output: 10 });
    expect(costOf("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(12);
    expect(costOf("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBe(18);
  });

  it("estimates more tokens per byte for the newer tokenizer", () => {
    // 40,000 bytes: 13,000 tokens at 4 bytes each, 16,900 at 30% more.
    expect(estimateCost("claude-sonnet-4-6", 40_000)).toBeCloseTo((13_000 * 3 + 4_000 * 15) / 1e6, 6);
    expect(estimateCost("claude-sonnet-5-5", 40_000)).toBeCloseTo((16_900 * 2 + 5_200 * 10) / 1e6, 6);
  });
});
