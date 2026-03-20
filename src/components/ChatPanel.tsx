"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { NarrativeReview } from "@/lib/types";
import { X, Send, MessageCircle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/hooks/useTheme";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  review: NarrativeReview;
  isOpen: boolean;
  onClose: () => void;
  initialQuestion?: string;
}

function buildPRContext(review: NarrativeReview): string {
  const chapterSummaries = review.chapters
    .map(
      (ch, i) =>
        `Chapter ${i + 1}: ${ch.title}\n${ch.narrative}\nFiles: ${[...new Set(ch.hunks.map((h) => h.file))].join(", ")}`
    )
    .join("\n\n");

  return `Title: ${review.title}
Summary: ${review.summary}
Root cause: ${review.rootCause}
Files changed: ${review.prInfo.changedFiles} (+${review.prInfo.additions}/-${review.prInfo.deletions})

## Chapters
${chapterSummaries}`;
}

export function ChatPanel({ review, isOpen, onClose, initialQuestion }: ChatPanelProps) {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prContext = useRef(buildPRContext(review));
  const lastInitialQuestion = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (e?: FormEvent, explicitText?: string) => {
      e?.preventDefault();
      const text = explicitText ?? input;
      if (!text.trim() || streaming) return;

      const userMessage: ChatMessage = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            prContext: prContext.current,
          }),
        });

        if (!res.ok) throw new Error("Chat request failed");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantContent = "";

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "" },
        ]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                assistantContent += data.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  return updated;
                });
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => m.content !== ""),
          {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          },
        ]);
      } finally {
        setStreaming(false);
      }
    },
    [input, messages, streaming]
  );

  // Auto-send when opened with a contextual question
  useEffect(() => {
    if (isOpen && initialQuestion && initialQuestion !== lastInitialQuestion.current && !streaming) {
      lastInitialQuestion.current = initialQuestion;
      handleSend(undefined, initialQuestion);
    }
  }, [isOpen, initialQuestion, streaming, handleSend]);

  return (
    <div
      className={`flex-shrink-0 border-l border-bd-primary bg-bg-secondary flex flex-col transition-[width] duration-300 ease-in-out sticky top-[73px] h-[calc(100vh-73px)] ${
        isOpen ? "w-[400px]" : "w-0 border-l-0 overflow-hidden"
      }`}
    >
      <div className={`flex flex-col h-full min-w-[400px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bd-primary flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-accent-text" />
            <span className="text-sm font-medium text-t-primary">
              Ask about this PR
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-t-tertiary hover:text-t-secondary transition-colors rounded-lg hover:bg-bg-tertiary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <MessageCircle className="w-8 h-8 text-bd-primary mx-auto mb-3" />
              <p className="text-sm text-t-tertiary mb-4">
                Ask anything about this PR
              </p>
              <div className="space-y-2">
                {[
                  "Is it safe to delete these functions?",
                  "What tests should cover these changes?",
                  "Summarize this PR in one paragraph",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="block w-full text-left text-xs bg-bg-tertiary/50 hover:bg-bg-tertiary text-t-tertiary hover:text-t-secondary rounded-lg px-3 py-2 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-bg-tertiary text-t-secondary"
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      code: ({ children, className }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        return match ? (
                          <SyntaxHighlighter style={isDark ? vscDarkPlus : vs} language={match[1]} PreTag="div" className="rounded my-1.5 text-xs">
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="bg-bg-secondary text-accent-text rounded px-1 py-0.5 font-mono text-xs">
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => <>{children}</>,
                      p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.role === "assistant" && msg.content === "" && streaming && (
                  <Loader2 className="w-4 h-4 animate-spin text-t-tertiary" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-bd-primary flex-shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the changes..."
              className="flex-1 bg-bg-tertiary border border-bd-primary rounded-lg px-3 py-2 text-sm text-t-primary placeholder-t-tertiary focus:outline-none focus:border-accent/50"
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="p-2 bg-accent hover:bg-accent/80 disabled:bg-bd-primary disabled:text-t-tertiary text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
