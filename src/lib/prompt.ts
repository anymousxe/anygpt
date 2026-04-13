import type { MemoryEntry } from "@/lib/types";

export const MEMORY_TOOL = {
  type: "function",
  name: "save_memory",
  description:
    "Save a durable user fact, preference, relationship detail, routine, or long-term context that will help in future chats.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: {
        type: "string",
        description: "A short stable key such as favorite tea, birthday month, or mom style.",
      },
      value: {
        type: "string",
        description: "The memory value to save.",
      },
      category: {
        type: "string",
        enum: ["profile", "preference", "context", "personal"],
        description: "Memory bucket.",
      },
    },
    required: ["label", "value", "category"],
  },
} as const;

export function buildAssistantInstructions(
  profileName: string,
  memories: MemoryEntry[]
) {
  const memoryLines = memories.length
    ? memories.map(
        (memory) => `- [${memory.category}] ${memory.label}: ${memory.value}`
      )
    : ["- No saved memories yet."];

  return [
    `You are Halo Chat, the personal AI for ${profileName}.`,
    "Be warm, clear, and genuinely useful.",
    "Use the save_memory tool when the user shares a stable preference, personal detail, family context, routine, or recurring project that could help later.",
    "Do not save passwords, API keys, one-time codes, payment data, or one-off transient requests.",
    "If a saved fact changes, call save_memory again with the same label and the newest value.",
    "Current saved memories:",
    ...memoryLines,
  ].join("\n\n");
}
