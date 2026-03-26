"use client";

import { useMemo, useRef, useEffect } from "react";
import { DiffSettings, HunkStep } from "@/lib/types";
import { DiffView } from "./DiffView";

interface SteppedDiffViewProps {
  diffContent: string;
  fileName: string;
  steps: HunkStep[];
  currentStepIndex: number;
  settings: DiffSettings;
  prInfo?: { owner: string; repo: string; number: number };
  fileContent?: string;
  annotation?: string;
}

/**
 * Builds a synthetic diff string where:
 * - Lines from completed steps (0..currentStepIndex-1) have `+` converted to ` ` (context)
 * - Lines from the current step keep their original prefixes
 * - Lines from future steps are excluded entirely
 *
 * This lets DiffView render prior steps as dimmed context and current step as highlighted adds.
 */
function buildProgressiveDiff(
  diffContent: string,
  steps: HunkStep[],
  currentStepIndex: number
): string {
  // Extract the header (everything before content lines)
  const allLines = diffContent.split("\n");
  const headerLines: string[] = [];
  let headerEnd = 0;

  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].startsWith("@@")) {
      headerLines.push(allLines[i]);
      headerEnd = i + 1;
      break;
    }
    headerLines.push(allLines[i]);
  }

  // Collect lines from steps 0..currentStepIndex
  const resultLines: string[] = [...headerLines];

  for (let si = 0; si <= currentStepIndex && si < steps.length; si++) {
    const step = steps[si];
    const isPriorStep = si < currentStepIndex;

    for (const line of step.lines) {
      if (isPriorStep && line.startsWith("+")) {
        // Convert completed additions to context lines
        resultLines.push(" " + line.slice(1));
      } else if (isPriorStep && line.startsWith("-")) {
        // Prior deletions are already applied, skip them
        continue;
      } else {
        resultLines.push(line);
      }
    }
  }

  return resultLines.join("\n");
}

export function SteppedDiffView({
  diffContent,
  fileName,
  steps,
  currentStepIndex,
  settings,
  prInfo,
  fileContent,
  annotation,
}: SteppedDiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(currentStepIndex);

  const syntheticDiff = useMemo(
    () => buildProgressiveDiff(diffContent, steps, currentStepIndex),
    [diffContent, steps, currentStepIndex]
  );

  // Auto-scroll to bring new content into view when step advances
  useEffect(() => {
    if (currentStepIndex > prevStepRef.current && containerRef.current) {
      // Find the last line element and scroll it into view
      const lines = containerRef.current.querySelectorAll("[data-line]");
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        lastLine.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    prevStepRef.current = currentStepIndex;
  }, [currentStepIndex]);

  const currentStep = steps[currentStepIndex];
  const showAnnotation = currentStep?.annotation || annotation;

  return (
    <div ref={containerRef} className="step-reveal-container">
      <DiffView
        diffContent={syntheticDiff}
        fileName={fileName}
        annotation={showAnnotation}
        settings={settings}
        prInfo={prInfo}
        fileContent={fileContent}
      />
    </div>
  );
}
