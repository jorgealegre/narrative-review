import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";
import type { PRComment } from "@/lib/types";

const DIFF_WITH_CHANGE = [
  "@@ -1,3 +1,3 @@",
  " const unchanged = true;",
  '-const value = "old";',
  '+const value = "new";',
  " after();",
].join("\n");

const DELETION_ONLY_DIFF = [
  "@@ -1,3 +1,2 @@",
  " keep();",
  "-removeOnly();",
  " after();",
].join("\n");

function comment(overrides: Partial<PRComment>): PRComment {
  return {
    id: overrides.id ?? 1,
    author: overrides.author ?? "reviewer",
    body: overrides.body ?? "comment body",
    path: overrides.path ?? "src/demo.ts",
    line: overrides.line ?? 1,
    side: overrides.side ?? "RIGHT",
    createdAt: overrides.createdAt ?? "2026-06-07T12:00:00Z",
    htmlUrl: overrides.htmlUrl ?? "#",
  };
}

function expectCommentInSplitCell(body: string, side: "old" | "new") {
  const cell = screen
    .getByText(body)
    .closest(`[data-testid="split-${side}-cell"]`);

  expect(cell).not.toBeNull();
}

function expectCommentNotInSplitCell(body: string, side: "old" | "new") {
  const cell = screen
    .getByText(body)
    .closest(`[data-testid="split-${side}-cell"]`);

  expect(cell).toBeNull();
}

describe("DiffView comments", () => {
  it("renders split change-row comments on the matching old and new sides", () => {
    render(
      <DiffView
        diffContent={DIFF_WITH_CHANGE}
        fileName="src/demo.ts"
        settings={{ viewMode: "split", hideWhitespace: false }}
        comments={[
          comment({
            id: 1,
            body: "old-side deletion note",
            line: 2,
            side: "LEFT",
          }),
          comment({
            id: 2,
            body: "new-side addition note",
            line: 2,
            side: "RIGHT",
          }),
        ]}
      />
    );

    expectCommentInSplitCell("old-side deletion note", "old");
    expectCommentNotInSplitCell("old-side deletion note", "new");
    expectCommentInSplitCell("new-side addition note", "new");
    expectCommentNotInSplitCell("new-side addition note", "old");
  });

  it("renders split context-row comments on the requested side", () => {
    render(
      <DiffView
        diffContent={DIFF_WITH_CHANGE}
        fileName="src/demo.ts"
        settings={{ viewMode: "split", hideWhitespace: false }}
        comments={[
          comment({
            id: 1,
            body: "old-side context note",
            line: 1,
            side: "LEFT",
          }),
          comment({
            id: 2,
            body: "new-side context note",
            line: 1,
            side: "RIGHT",
          }),
        ]}
      />
    );

    expectCommentInSplitCell("old-side context note", "old");
    expectCommentNotInSplitCell("old-side context note", "new");
    expectCommentInSplitCell("new-side context note", "new");
    expectCommentNotInSplitCell("new-side context note", "old");
  });

  it("renders unified deleted-line comments from the old side", () => {
    render(
      <DiffView
        diffContent={DELETION_ONLY_DIFF}
        fileName="src/demo.ts"
        settings={{ viewMode: "unified", hideWhitespace: false }}
        comments={[
          comment({
            id: 1,
            body: "deleted-line note",
            line: 2,
            side: "LEFT",
          }),
        ]}
      />
    );

    expect(screen.getByText("deleted-line note")).toBeTruthy();
  });
});
