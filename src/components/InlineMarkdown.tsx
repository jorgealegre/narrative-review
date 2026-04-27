"use client";

import ReactMarkdown from "react-markdown";

/**
 * Render review prose (summaries, root cause, narratives) with inline markdown.
 * Backticks become <code> chips matching the existing narrative style.
 * Paragraphs unwrap so the parent can control spacing.
 */
export function InlineMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <ReactMarkdown
      components={{
        code: ({ children }) => (
          <code className="bg-bg-secondary text-accent-text rounded px-1 py-0.5 font-mono text-[0.9em]">
            {children}
          </code>
        ),
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <span className={className}>{children}</span>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
