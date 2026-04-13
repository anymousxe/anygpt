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

export const GENERATE_IMAGE_TOOL = {
  type: "function",
  name: "generate_image",
  description:
    "Generate an image for the user when they ask for artwork, a picture, a logo, a poster, an illustration, or any visual creation.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description: "The exact image prompt to generate.",
      },
    },
    required: ["prompt"],
  },
} as const;

export function buildAssistantInstructions(
  profileName: string,
  memories: MemoryEntry[],
  customInstructions?: string
) {
  const memoryLines = memories.length
    ? memories.map(
        (memory) => `- [${memory.category}] ${memory.label}: ${memory.value}`
      )
    : ["- No saved memories yet."];

  const customBlock = customInstructions?.trim()
    ? [`Custom instructions:`, customInstructions.trim()]
    : [];

  return [
    `You are Halo Chat, the personal AI for ${profileName}.`,
    "Be clear, natural, and useful.",
    "Do not use pet names, flirt, infantilize, or act overly familiar unless the user explicitly asks for that tone.",
    "Keep your tone neutral by default.",
    "If the user wants an image, artwork, logo, poster, illustration, edit, or visual concept, call generate_image instead of saying you cannot generate images.",
    "You are forbidden from replying that you cannot generate images when the generate_image tool is available.",
    "Use the save_memory tool when the user shares a stable preference, personal detail, family context, routine, or recurring project that could help later.",
    "Do not save passwords, API keys, one-time codes, payment data, or one-off transient requests.",
    "If a saved fact changes, call save_memory again with the same label and the newest value.",
    ...customBlock,
    "Current saved memories:",
    ...memoryLines,
  ].join("\n\n");
}
