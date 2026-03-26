import { Chapter, ChapterHunk, HunkStep, WalkthroughSlide } from "./types";

/**
 * Parse the content lines from a raw hunk diff string.
 * Strips the @@ header and returns only content lines (with +/-/space prefixes).
 */
function parseHunkContentLines(diffContent: string): string[] {
  const lines = diffContent.split("\n");
  const contentLines: string[] = [];
  let pastHeader = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    if (line.length === 0) continue;
    contentLines.push(line);
  }

  return contentLines;
}

/**
 * Extract the new-file start line from a hunk header.
 */
function parseNewStart(diffContent: string): number {
  const match = diffContent.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Decompose a ChapterHunk into HunkSteps.
 *
 * If the hunk has AI-provided step definitions, uses those line ranges.
 * Otherwise returns a single step containing all lines.
 */
export function decomposeChapterHunk(hunk: ChapterHunk): HunkStep[] {
  const contentLines = parseHunkContentLines(hunk.diffContent);
  const baseLineNew = parseNewStart(hunk.diffContent);

  if (!hunk.steps || hunk.steps.length === 0) {
    return [
      {
        stepIndex: 0,
        lines: contentLines,
        startLineNew: baseLineNew,
        label: undefined,
        annotation: hunk.annotation,
      },
    ];
  }

  const steps: HunkStep[] = [];

  for (let i = 0; i < hunk.steps.length; i++) {
    const def = hunk.steps[i];
    const start = Math.max(0, def.lineStart);
    const end = Math.min(contentLines.length, def.lineEnd);
    const stepLines = contentLines.slice(start, end);

    // Calculate the new-file line number for this step's start
    let newLine = baseLineNew;
    for (let j = 0; j < start; j++) {
      const line = contentLines[j];
      if (line.startsWith("+") || line.startsWith(" ")) {
        newLine++;
      }
    }

    steps.push({
      stepIndex: i,
      lines: stepLines,
      startLineNew: newLine,
      label: def.label,
      annotation: def.annotation,
    });
  }

  return steps;
}

/**
 * Build a flat slide list from all chapters.
 *
 * Each slide maps to a specific (chapter, hunk, step) triple.
 * The intro slide is NOT included — the caller handles that.
 */
export function buildSlideList(chapters: Chapter[]): WalkthroughSlide[] {
  const slides: WalkthroughSlide[] = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const chapterSlideStart = slides.length;

    for (let hi = 0; hi < chapter.hunks.length; hi++) {
      const hunk = chapter.hunks[hi];
      const steps = decomposeChapterHunk(hunk);

      for (let si = 0; si < steps.length; si++) {
        slides.push({
          chapterIndex: ci,
          hunkIndex: hi,
          stepIndex: si,
          isChapterStart: false, // set below
          isChapterEnd: false, // set below
        });
      }
    }

    // Mark boundaries
    if (slides.length > chapterSlideStart) {
      slides[chapterSlideStart].isChapterStart = true;
      slides[slides.length - 1].isChapterEnd = true;
    }
  }

  return slides;
}

/**
 * Given a flat slide list, find the index of the next slide that starts a new chapter.
 * Returns -1 if none found.
 */
export function findNextChapterStart(
  slides: WalkthroughSlide[],
  currentIndex: number
): number {
  for (let i = currentIndex + 1; i < slides.length; i++) {
    if (slides[i].isChapterStart) return i;
  }
  return -1;
}

/**
 * Given a flat slide list, find the index of the previous chapter's start.
 * Returns -1 if none found.
 */
export function findPrevChapterStart(
  slides: WalkthroughSlide[],
  currentIndex: number
): number {
  // First, find which chapter we're in
  const currentChapter = slides[currentIndex]?.chapterIndex ?? -1;

  // If we're not on the first slide of this chapter, go to this chapter's start
  if (currentIndex > 0 && !slides[currentIndex].isChapterStart) {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (slides[i].isChapterStart && slides[i].chapterIndex === currentChapter)
        return i;
    }
  }

  // Otherwise find the previous chapter's start
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (slides[i].isChapterStart && slides[i].chapterIndex < currentChapter)
      return i;
  }
  return -1;
}
