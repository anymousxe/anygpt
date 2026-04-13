import {
  MEMORY_CATEGORIES,
  type ChatFolder,
  type ChatMessage,
  type ChatThread,
  type GeneratedImage,
  type MemoryCategory,
  type MemoryEntry,
  type MemoryWrite,
  type PersistedState,
  type UploadAttachment,
  type UserProfile,
} from "@/lib/types";

export const APP_NAME = "Halo Chat";
export const APP_VERSION = 1;
export const STORAGE_KEY = "halo-chat-state:v1";
export const BACKUP_FILE_PREFIX = "halo-chat-backup";
export const MAX_IMAGE_DIM = 768;
export const MAX_IMAGE_QUALITY = 0.58;
export const PROFILE_PRESETS = [
  { slug: "mom", name: "Mom" },
  { slug: "aiden", name: "Aiden" },
] as const;

export type ProfileSlug = (typeof PROFILE_PRESETS)[number]["slug"];

const PROFILE_ACCENTS = [
  "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(212,212,216,0.72), rgba(39,39,42,0.92))",
  "linear-gradient(135deg, rgba(244,244,245,0.92), rgba(161,161,170,0.66), rgba(9,9,11,0.94))",
  "linear-gradient(135deg, rgba(231,229,228,0.92), rgba(168,162,158,0.66), rgba(28,25,23,0.95))",
  "linear-gradient(135deg, rgba(250,250,250,0.94), rgba(148,163,184,0.58), rgba(15,23,42,0.94))",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readDate(value: unknown) {
  const parsed = readString(value);
  return parsed || nowIso();
}

function isMemoryCategory(value: string): value is MemoryCategory {
  return MEMORY_CATEGORIES.includes(value as MemoryCategory);
}

function normalizeAttachment(value: unknown): UploadAttachment | null {
  if (!isRecord(value)) {
    return null;
  }

  const dataUrl = readString(value.dataUrl).trim();

  if (!dataUrl) {
    return null;
  }

  return {
    id: readString(value.id, makeId("attachment")),
    name: readString(value.name, "Image"),
    mimeType: readString(value.mimeType, "image/png"),
    dataUrl,
  };
}

function normalizeGeneratedImage(value: unknown): GeneratedImage | null {
  if (!isRecord(value)) {
    return null;
  }

  const dataUrl = readString(value.dataUrl).trim();
  const prompt = readString(value.prompt).trim();

  if (!dataUrl || !prompt) {
    return null;
  }

  const revisedPrompt = readString(value.revisedPrompt).trim();

  return {
    dataUrl,
    prompt,
    revisedPrompt: revisedPrompt || undefined,
  };
}

function normalizeMemoryWrite(value: unknown): MemoryWrite | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value.label).trim();
  const memoryValue = readString(value.value).trim();
  const category = readString(value.category).trim();

  if (!label || !memoryValue || !isMemoryCategory(category)) {
    return null;
  }

  return {
    label,
    value: memoryValue,
    category,
  };
}

function normalizeMemoryEntry(value: unknown): MemoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const normalized = normalizeMemoryWrite(value);

  if (!normalized) {
    return null;
  }

  return {
    id: readString(value.id, makeId("memory")),
    createdAt: readDate(value.createdAt),
    updatedAt: readDate(value.updatedAt),
    ...normalized,
  };
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = value.role === "user" ? "user" : value.role === "assistant" ? "assistant" : null;

  if (!role) {
    return null;
  }

  return {
    id: readString(value.id, makeId("message")),
    role,
    text: readString(value.text),
    createdAt: readDate(value.createdAt),
    attachments: Array.isArray(value.attachments)
      ? value.attachments
          .map((attachment) => normalizeAttachment(attachment))
          .filter((attachment): attachment is UploadAttachment => attachment !== null)
      : [],
    generatedImage: normalizeGeneratedImage(value.generatedImage),
    memoryWrites: Array.isArray(value.memoryWrites)
      ? value.memoryWrites
          .map((memoryWrite) => normalizeMemoryWrite(memoryWrite))
          .filter((memoryWrite): memoryWrite is MemoryWrite => memoryWrite !== null)
      : [],
    mode: value.mode === "image" ? "image" : "chat",
    error: readString(value.error) || undefined,
  };
}

function normalizeFolder(value: unknown): ChatFolder | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = readString(value.name).trim();

  if (!name) {
    return null;
  }

  return {
    id: readString(value.id, makeId("folder")),
    name,
    createdAt: readDate(value.createdAt),
  };
}

function normalizeChat(value: unknown): ChatThread | null {
  if (!isRecord(value)) {
    return null;
  }

  const messages = Array.isArray(value.messages)
    ? value.messages
        .map((message) => normalizeMessage(message))
        .filter((message): message is ChatMessage => message !== null)
    : [];

  return {
    id: readString(value.id, makeId("chat")),
    title: readString(value.title, "New chat") || "New chat",
    folderId: typeof value.folderId === "string" ? value.folderId : null,
    createdAt: readDate(value.createdAt),
    updatedAt: readDate(value.updatedAt),
    messages,
  };
}

function normalizeProfile(value: unknown, index: number): UserProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const chats = Array.isArray(value.chats)
    ? value.chats
        .map((chat) => normalizeChat(chat))
        .filter((chat): chat is ChatThread => chat !== null)
    : [];

  const safeChats = chats.length > 0 ? chats : [createThread(null)];
  const activeChatId = readString(value.activeChatId);
  const fallbackChatId = safeChats[0].id;

  return {
    id: readString(value.id, makeId("profile")),
    name: readString(value.name, `Profile ${index + 1}`).trim() || `Profile ${index + 1}`,
    accent: readString(value.accent, pickProfileAccent(index)),
    activeChatId: safeChats.some((chat) => chat.id === activeChatId)
      ? activeChatId
      : fallbackChatId,
    chats: safeChats,
    folders: Array.isArray(value.folders)
      ? value.folders
          .map((folder) => normalizeFolder(folder))
          .filter((folder): folder is ChatFolder => folder !== null)
      : [],
    memories: Array.isArray(value.memories)
      ? value.memories
          .map((memory) => normalizeMemoryEntry(memory))
          .filter((memory): memory is MemoryEntry => memory !== null)
      : [],
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function compressImageToDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", MAX_IMAGE_QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read image."));
    };

    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        void readFileAsDataUrl(file).then(resolve, reject);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", MAX_IMAGE_QUALITY));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      void readFileAsDataUrl(file).then(
        (dataUrl) => compressImageToDataUrl(dataUrl).then(resolve, () => resolve(dataUrl)),
        reject
      );
    };

    img.src = objectUrl;
  });
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function pickProfileAccent(index: number) {
  return PROFILE_ACCENTS[index % PROFILE_ACCENTS.length];
}

export function normalizeProfileSlug(value: string | null | undefined): ProfileSlug {
  return value?.trim().toLowerCase() === "aiden" ? "aiden" : "mom";
}

export function getProfileSlug(name: string): ProfileSlug {
  return normalizeProfileSlug(name);
}

export function createThread(folderId: string | null = null): ChatThread {
  const now = nowIso();

  return {
    id: makeId("chat"),
    title: "New chat",
    folderId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function createProfile(name: string, accent = pickProfileAccent(0)): UserProfile {
  const chat = createThread();

  return {
    id: makeId("profile"),
    name,
    accent,
    activeChatId: chat.id,
    chats: [chat],
    folders: [],
    memories: [],
  };
}

export function createInitialState(): PersistedState {
  const mom = createProfile("Mom", pickProfileAccent(0));
  const aiden = createProfile("Aiden", pickProfileAccent(1));

  return {
    version: APP_VERSION,
    activeProfileId: mom.id,
    profiles: [mom, aiden],
    settings: {
      imageMode: false,
      autoDetectImages: true,
      customInstructions: "",
    },
  };
}

function migrateLegacyProfiles(profiles: UserProfile[]) {
  if (profiles.length === 1 && profiles[0].name.trim().toLowerCase() === "private") {
    const migratedAiden: UserProfile = {
      ...profiles[0],
      name: "Aiden",
      accent: pickProfileAccent(1),
    };

    return [createProfile("Mom", pickProfileAccent(0)), migratedAiden];
  }

  return profiles;
}

export function normalizePersistedState(value: unknown): PersistedState {
  const fallback = createInitialState();

  if (!isRecord(value) || !Array.isArray(value.profiles)) {
    return fallback;
  }

  const profiles = migrateLegacyProfiles(
    value.profiles
    .map((profile, index) => normalizeProfile(profile, index))
    .filter((profile): profile is UserProfile => profile !== null)
  );

  if (profiles.length === 0) {
    return fallback;
  }

  const activeProfileId = readString(value.activeProfileId);

  return {
    version: APP_VERSION,
    activeProfileId: profiles.some((profile) => profile.id === activeProfileId)
      ? activeProfileId
      : profiles[0].id,
    profiles,
    settings: isRecord(value.settings)
      ? {
          imageMode: Boolean(value.settings.imageMode),
          autoDetectImages:
            typeof value.settings.autoDetectImages === "boolean"
              ? value.settings.autoDetectImages
              : true,
          customInstructions:
            typeof value.settings.customInstructions === "string"
              ? value.settings.customInstructions
              : "",
        }
      : {
          imageMode: false,
          autoDetectImages: true,
          customInstructions: "",
        },
  };
}

export function createTitleFromText(input: string) {
  const cleaned = input.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "New chat";
  }

  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}...` : cleaned;
}

export function upsertMemories(existing: MemoryEntry[], writes: MemoryWrite[]) {
  const byKey = new Map(
    existing.map((memory) => [
      `${memory.category}:${memory.label.toLowerCase()}`,
      memory,
    ])
  );

  for (const write of writes) {
    const key = `${write.category}:${write.label.toLowerCase()}`;
    const current = byKey.get(key);
    const now = nowIso();

    byKey.set(key, {
      id: current?.id ?? makeId("memory"),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...write,
    });
  }

  return [...byKey.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}
