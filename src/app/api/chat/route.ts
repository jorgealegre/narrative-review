import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { messages, prContext } = await request.json();

    const systemPrompt = `You are a helpful code review assistant. You have full context of a pull request that the user is reviewing.

## PR Context
${prContext}

## Instructions
- Answer questions about the code changes, their safety, their purpose, or their implications.
- Be concise and direct. The user is a developer reviewing code.
- Reference specific files and changes when relevant.
- If asked about safety, consider whether deleted code has other callers, whether the changes are backwards compatible, etc.`;

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages.map(
        (m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      ),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
