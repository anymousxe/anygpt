import OpenAI from "openai";
import { NextResponse } from "next/server";

import { isAuthorizedRequest } from "@/lib/access";
import { generateImageWithFallback } from "@/lib/image-generation";
import { buildAssistantInstructions, GENERATE_IMAGE_TOOL, MEMORY_TOOL } from "@/lib/prompt";
import {
  MEMORY_CATEGORIES,
  type ChatRequestPayload,
  type GeneratedImage,
  type MemoryEntry,
  type MemoryWrite,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function isMemoryCategory(value: string): value is MemoryWrite["category"] {
  return MEMORY_CATEGORIES.includes(value as MemoryWrite["category"]);
}

function normalizeMemoryWrite(value: unknown): MemoryWrite | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const memoryValue = typeof record.value === "string" ? record.value.trim() : "";
  const category = typeof record.category === "string" ? record.category.trim() : "";

  if (!label || !memoryValue || !isMemoryCategory(category)) {
    return null;
  }

  return {
    label,
    value: memoryValue,
    category,
  };
}

function dedupeMemoryWrites(writes: MemoryWrite[]) {
  const byKey = new Map<string, MemoryWrite>();

  for (const write of writes) {
    byKey.set(`${write.category}:${write.label.toLowerCase()}`, write);
  }

  return [...byKey.values()];
}

function isSaveMemoryCall(
  item: unknown
): item is {
  type: "function_call";
  name: "save_memory";
  arguments: string;
  call_id: string;
} {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;

  return (
    record.type === "function_call" &&
    record.name === "save_memory" &&
    typeof record.arguments === "string" &&
    typeof record.call_id === "string"
  );
}

function isGenerateImageCall(
  item: unknown
): item is {
  type: "function_call";
  name: "generate_image";
  arguments: string;
  call_id: string;
} {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;

  return (
    record.type === "function_call" &&
    record.name === "generate_image" &&
    typeof record.arguments === "string" &&
    typeof record.call_id === "string"
  );
}

function serializeMessages(messages: ChatRequestPayload["messages"]) {
  const serialized: Array<
    | { role: "assistant"; content: string }
    | {
        role: "user";
        content: Array<
          | { type: "input_text"; text: string }
          | { type: "input_image"; image_url: string; detail: "auto" }
        >;
      }
  > = [];

  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "assistant") {
      const assistantText = message.text.trim();

      if (assistantText) {
        serialized.push({
          role: "assistant",
          content: assistantText,
        });
      }

      continue;
    }

    const includeAttachments = i === lastUserIndex;
    const content = [
      ...(message.text.trim()
        ? [{ type: "input_text" as const, text: message.text.trim() }]
        : []),
      ...(includeAttachments
        ? message.attachments.map((attachment) => ({
            type: "input_image" as const,
            image_url: attachment.dataUrl,
            detail: "auto" as const,
          }))
        : []),
    ];

    if (content.length === 0) {
      continue;
    }

    serialized.push({
        role: "user" as const,
        content,
      });
  }

  return serialized;
}

function normalizeMemories(memories: unknown): MemoryEntry[] {
  if (!Array.isArray(memories)) {
    return [];
  }

  return memories
    .flatMap((memory) => {
      if (typeof memory !== "object" || memory === null) {
        return [];
      }

      const record = memory as Record<string, unknown>;
      const normalized = normalizeMemoryWrite(record);

      if (!normalized) {
        return [];
      }

      return [
        {
          id: typeof record.id === "string" ? record.id : "",
          label: normalized.label,
          value: normalized.value,
          category: normalized.category,
          createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        },
      ];
    });
}

export async function POST(request: Request) {
  try {
    if (!isAuthorizedRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request too large. Try removing some images." },
        { status: 413 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing OPENAI_API_KEY. Add it to your local .env.local and your Vercel project settings.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as Partial<ChatRequestPayload>;
    const profileName =
      typeof body.profileName === "string" && body.profileName.trim()
        ? body.profileName.trim()
        : "User";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const memories = normalizeMemories(body.memories);
    const customInstructions =
      typeof body.customInstructions === "string" ? body.customInstructions.trim() : "";

    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-nano";
    const memoryWrites: MemoryWrite[] = [];
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const writeEvent = (event: object) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          let assistantText = "";
          let generatedImage: GeneratedImage | undefined;
          let input: any = serializeMessages(messages);
          let previousResponseId: string | undefined;

          for (let index = 0; index < 4; index += 1) {
            const responseStream = await client.responses.stream({
              model,
              instructions: buildAssistantInstructions(
                profileName,
                memories,
                customInstructions
              ),
              input,
              max_output_tokens: 1200,
              parallel_tool_calls: true,
              reasoning: {
                effort: "none",
              },
              service_tier: "default",
              store: true,
              tools: [MEMORY_TOOL, GENERATE_IMAGE_TOOL],
              ...(previousResponseId
                ? { previous_response_id: previousResponseId }
                : {}),
            });

            for await (const event of responseStream) {
              if (event.type === "response.output_text.delta") {
                assistantText += event.delta;
                writeEvent({ type: "delta", delta: event.delta });
              }
            }

            const response = await responseStream.finalResponse();
            const toolCalls = (response.output ?? []).filter(
              (item) => isSaveMemoryCall(item) || isGenerateImageCall(item)
            );

            if (toolCalls.length === 0) {
              writeEvent({
                type: "done",
                text: assistantText.trim() || "I’m here.",
                memoryWrites: dedupeMemoryWrites(memoryWrites),
                ...(generatedImage ? { generatedImage } : {}),
              });
              return;
            }

            input = (await Promise.all(
              toolCalls.map(async (call) => {
                if (isSaveMemoryCall(call)) {
                  const memoryCall = call as {
                    call_id: string;
                    arguments: string;
                  };
                  let parsed: MemoryWrite | null = null;

                  try {
                    parsed = normalizeMemoryWrite(JSON.parse(memoryCall.arguments));
                  } catch {
                    parsed = null;
                  }

                  if (parsed) {
                    memoryWrites.push(parsed);
                  }

                  return {
                    type: "function_call_output" as const,
                    call_id: memoryCall.call_id,
                    output: JSON.stringify(
                      parsed
                        ? { saved: true, label: parsed.label }
                        : { saved: false, reason: "Invalid arguments" }
                    ),
                  };
                }

                const imageCall = call as {
                  call_id: string;
                  arguments: string;
                };

                try {
                  const parsed = JSON.parse(imageCall.arguments) as { prompt?: string };
                  const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";

                  if (!prompt) {
                    return {
                      type: "function_call_output" as const,
                      call_id: imageCall.call_id,
                      output: JSON.stringify({ generated: false, reason: "Missing prompt" }),
                    };
                  }

                  generatedImage = await generateImageWithFallback(client, prompt);

                  return {
                    type: "function_call_output" as const,
                    call_id: imageCall.call_id,
                    output: JSON.stringify({
                      generated: true,
                      prompt: generatedImage.prompt,
                      revisedPrompt: generatedImage.revisedPrompt ?? null,
                    }),
                  };
                } catch (error) {
                  return {
                    type: "function_call_output" as const,
                    call_id: imageCall.call_id,
                    output: JSON.stringify({
                      generated: false,
                      reason: error instanceof Error ? error.message : "Image generation failed",
                    }),
                  };
                }
              })
            )) as any;
            previousResponseId = response.id;
          }

          writeEvent({
            type: "done",
            text: assistantText.trim() || "I’m here.",
            memoryWrites: dedupeMemoryWrites(memoryWrites),
            ...(generatedImage ? { generatedImage } : {}),
          });
        } catch (error) {
          writeEvent({
            type: "error",
            error: `Chat request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: `Chat request failed: ${message}`,
      },
      { status: 500 }
    );
  }
}
