export const MEMORY_CATEGORIES = [
  "profile",
  "preference",
  "context",
  "personal",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type UploadAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type GeneratedImage = {
  dataUrl: string;
  prompt: string;
  revisedPrompt?: string;
};

export type MemoryWrite = {
  label: string;
  value: string;
  category: MemoryCategory;
};

export type MemoryEntry = MemoryWrite & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  attachments: UploadAttachment[];
  generatedImage: GeneratedImage | null;
  memoryWrites: MemoryWrite[];
  mode: "chat" | "image";
  error?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ChatFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type UserProfile = {
  id: string;
  name: string;
  accent: string;
  activeChatId: string;
  chats: ChatThread[];
  folders: ChatFolder[];
  memories: MemoryEntry[];
};

export type AppSettings = {
  imageMode: boolean;
  autoDetectImages: boolean;
};

export type PersistedState = {
  version: number;
  activeProfileId: string;
  profiles: UserProfile[];
  settings: AppSettings;
};

export type ChatRequestPayload = {
  profileName: string;
  messages: Array<Pick<ChatMessage, "role" | "text" | "attachments">>;
  memories: MemoryEntry[];
};

export type ChatResponsePayload = {
  text: string;
  memoryWrites: MemoryWrite[];
};

export type ChatStreamEvent =
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "done";
      text: string;
      memoryWrites: MemoryWrite[];
    }
  | {
      type: "error";
      error: string;
    };

export type ImageRequestPayload = {
  prompt: string;
  profileName: string;
};

export type ImageResponsePayload = {
  image: GeneratedImage;
};
