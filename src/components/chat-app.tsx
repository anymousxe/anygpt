/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Brain,
  ChevronDown,
  Download,
  FolderClosed,
  FolderPlus,
  ImagePlus,
  Menu,
  MessageSquarePlus,
  Plus,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  APP_NAME,
  BACKUP_FILE_PREFIX,
  compressImageFile,
  compressImageToDataUrl,
  createInitialState,
  createThread,
  createTitleFromText,
  getProfileSlug,
  loadPersistedStateFromBrowser,
  makeId,
  normalizePersistedState,
  nowIso,
  savePersistedStateToBrowser,
  upsertMemories,
} from "@/lib/app-state";
import { detectImageIntent } from "@/lib/image-intent";
import type {
  ChatFolder,
  ChatMessage,
  ChatRequestPayload,
  ChatResponsePayload,
  ChatStreamEvent,
  ImageResponsePayload,
  MemoryWrite,
  PersistedState,
  UploadAttachment,
  UserProfile,
} from "@/lib/types";

const SUGGESTIONS = [
  {
    title: "Plan the week",
    description: "Easy meals, shopping list, calm structure.",
    prompt:
      "Create a simple dinner plan for the week with easy meals, short prep, and a compact shopping list.",
    imageMode: false,
  },
  {
    title: "Understand a photo",
    description: "Upload an image and ask what stands out.",
    prompt: "Please analyze this image and tell me what stands out.",
    imageMode: false,
  },
  {
    title: "Generate art",
    description: "Soft monochrome glassy image prompt starter.",
    prompt:
      "Generate a soft black-and-white portrait with elegant studio lighting and a subtle liquid-glass glow.",
    imageMode: true,
  },
] as const;

type Notice = {
  kind: "success" | "error";
  text: string;
};

type EditorDialog = {
  value: string;
};

type SidebarAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

type ComposerMode = "chat" | "image";

function formatRelativeTime(timestamp: string) {
  const delta = Date.now() - new Date(timestamp).getTime();

  if (Number.isNaN(delta)) {
    return "Just now";
  }

  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;

  if (delta < minute) {
    return "Just now";
  }

  if (delta < hour) {
    return `${Math.round(delta / minute)}m ago`;
  }

  if (delta < day) {
    return `${Math.round(delta / hour)}h ago`;
  }

  return `${Math.round(delta / day)}d ago`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ChatApp() {
  const [state, setState] = useState<PersistedState | null>(null);
  const [composer, setComposer] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState<UploadAttachment[]>([]);
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMemoryOpen, setMobileMemoryOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedChatId, setDraggedChatId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorDialog, setEditorDialog] = useState<EditorDialog | null>(null);
  const [isMutating, startTransition] = useTransition();

  const deferredSearch = useDeferredValue(search);
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerModeRef = useRef<ComposerMode>("chat");
  const imageMenuRef = useRef<HTMLDivElement>(null);

  function getActiveTextarea() {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      return mobileTextareaRef.current;
    }

    return desktopTextareaRef.current ?? mobileTextareaRef.current;
  }

  useEffect(() => {
    let cancelled = false;

    void loadPersistedStateFromBrowser()
      .then((loaded) => {
        if (!cancelled) {
          setState(loaded ?? createInitialState());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState(createInitialState());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    let cancelled = false;

    void savePersistedStateToBrowser(state).then((result) => {
      if (!result.fullStateSaved && !cancelled) {
        setNotice({
          kind: "error",
          text: "Local browser storage failed. Your latest image history may not persist.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const url = new URL(window.location.href);
    const requestedProfile = url.searchParams.get("profile");

    if (!requestedProfile) {
      return;
    }

    const nextProfile = state.profiles.find(
      (profile) => getProfileSlug(profile.name) === requestedProfile
    );

    if (nextProfile && nextProfile.id !== state.activeProfileId) {
      setState((current) =>
        current
          ? {
              ...current,
              activeProfileId: nextProfile.id,
            }
          : current
      );
    }

    url.searchParams.delete("profile");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [state]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const maxHeight = Math.max(120, Math.round(window.innerHeight * 0.15));

    for (const element of [desktopTextareaRef.current, mobileTextareaRef.current]) {
      if (!element) {
        continue;
      }

      element.style.height = "0px";
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    }
  }, [composer]);

  useEffect(() => {
    const nextMode: ComposerMode = state?.settings.imageMode ? "image" : "chat";
    composerModeRef.current = nextMode;
    setComposerMode(nextMode);
  }, [state?.settings.imageMode]);

  useEffect(() => {
    if (!imageMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!imageMenuRef.current?.contains(event.target as Node)) {
        setImageMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [imageMenuOpen]);

  useEffect(() => {
    if (!editorDialog) {
      return;
    }

    dialogInputRef.current?.focus();
    dialogInputRef.current?.select();
  }, [editorDialog]);

  const activeProfile = useMemo(() => {
    if (!state) {
      return null;
    }

    return (
      state.profiles.find((profile) => profile.id === state.activeProfileId) ??
      state.profiles[0] ??
      null
    );
  }, [state]);

  const activeChat = useMemo(() => {
    if (!activeProfile) {
      return null;
    }

    return (
      activeProfile.chats.find((chat) => chat.id === activeProfile.activeChatId) ??
      activeProfile.chats[0] ??
      null
    );
  }, [activeProfile]);

  const activeMessageCount = activeChat?.messages.length ?? 0;
  const activeMessageTail = activeChat?.messages.at(-1)?.text ?? "";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessageCount, activeMessageTail, state?.activeProfileId, isSending]);

  const filteredChats = useMemo(() => {
    if (!activeProfile) {
      return [];
    }

    const query = deferredSearch.trim().toLowerCase();
    const sorted = [...activeProfile.chats].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );

    if (!query) {
      return sorted;
    }

    return sorted.filter((chat) => {
      if (chat.title.toLowerCase().includes(query)) {
        return true;
      }

      return chat.messages.some((message) =>
        message.text.toLowerCase().includes(query)
      );
    });
  }, [activeProfile, deferredSearch]);

  const groupedChats = useMemo(() => {
    if (!activeProfile) {
      return {
        unfiled: [],
        folderGroups: [] as Array<{ folder: ChatFolder; chats: typeof filteredChats }>,
      };
    }

    const searching = deferredSearch.trim().length > 0;

    return {
      unfiled: filteredChats.filter((chat) => !chat.folderId),
      folderGroups: activeProfile.folders
        .map((folder) => ({
          folder,
          chats: filteredChats.filter((chat) => chat.folderId === folder.id),
        }))
        .filter((group) => group.chats.length > 0 || !searching),
    };
  }, [activeProfile, deferredSearch, filteredChats]);

  const autoImageDetected = Boolean(
    state &&
      state.settings.autoDetectImages &&
      queuedAttachments.length === 0 &&
      detectImageIntent(composer)
  );

  const willGenerateImage = Boolean(
    state &&
      queuedAttachments.length === 0 &&
      (composerMode === "image" || autoImageDetected)
  );

  const canSend =
    !isSending &&
    !isMutating &&
    (composer.trim().length > 0 || queuedAttachments.length > 0);
  const activeTailMessage = activeChat?.messages.at(-1) ?? null;
  const showThinking =
    isSending &&
    !(activeTailMessage?.role === "assistant" && (activeTailMessage.text || activeTailMessage.error));

  function updateState(
    updater: (current: PersistedState) => PersistedState
  ) {
    setState((current) => (current ? updater(current) : current));
  }

  function updateActiveProfile(updater: (profile: UserProfile) => UserProfile) {
    updateState((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === current.activeProfileId ? updater(profile) : profile
      ),
    }));
  }

  function updateSettings(patch: Partial<PersistedState["settings"]>) {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
      },
    }));
  }

  function appendMessageToChat(
    profileId: string,
    chatId: string,
    message: ChatMessage,
    options?: {
      title?: string;
      memoryWrites?: MemoryWrite[];
    }
  ) {
    startTransition(() => {
      setState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          profiles: current.profiles.map((profile) => {
            if (profile.id !== profileId) {
              return profile;
            }

            return {
              ...profile,
              memories:
                options?.memoryWrites && options.memoryWrites.length > 0
                  ? upsertMemories(profile.memories, options.memoryWrites)
                  : profile.memories,
              chats: profile.chats.map((chat) => {
                if (chat.id !== chatId) {
                  return chat;
                }

                return {
                  ...chat,
                  title: options?.title ?? chat.title,
                  updatedAt: message.createdAt,
                  messages: [...chat.messages, message],
                };
              }),
            };
          }),
        };
      });
    });
  }

  function updateMessageInChat(
    profileId: string,
    chatId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
    options?: {
      title?: string;
      memoryWrites?: MemoryWrite[];
    }
  ) {
    startTransition(() => {
      setState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          profiles: current.profiles.map((profile) => {
            if (profile.id !== profileId) {
              return profile;
            }

            return {
              ...profile,
              memories:
                options?.memoryWrites && options.memoryWrites.length > 0
                  ? upsertMemories(profile.memories, options.memoryWrites)
                  : profile.memories,
              chats: profile.chats.map((chat) => {
                if (chat.id !== chatId) {
                  return chat;
                }

                return {
                  ...chat,
                  title: options?.title ?? chat.title,
                  updatedAt: nowIso(),
                  messages: chat.messages.map((message) =>
                    message.id === messageId ? updater(message) : message
                  ),
                };
              }),
            };
          }),
        };
      });
    });
  }

  async function queueFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      setNotice({ kind: "error", text: "Only image uploads are supported." });
      return;
    }

    try {
      const attachments = await Promise.all(
        imageFiles.map(async (file) => {
          const compressedDataUrl = await compressImageFile(file);
          return {
            id: makeId("attachment"),
            name: file.name || "Image",
            mimeType: file.type || "image/jpeg",
            dataUrl: compressedDataUrl,
          };
        })
      );

      setQueuedAttachments((current) => [...current, ...attachments]);
      setImageMenuOpen(false);
      getActiveTextarea()?.focus();
    } catch {
      setNotice({ kind: "error", text: "Couldn't read one of those images." });
    }
  }

  async function readChatStream(
    response: Response,
    onEvent: (event: ChatStreamEvent) => void
  ) {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Streaming response was empty.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const rawLine = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (rawLine) {
          onEvent(JSON.parse(rawLine) as ChatStreamEvent);
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      onEvent(JSON.parse(trailing) as ChatStreamEvent);
    }
  }

  function handleCreateChat(folderId: string | null = null) {
    const chat = createThread(folderId);

    updateActiveProfile((profile) => ({
      ...profile,
      activeChatId: chat.id,
      chats: [chat, ...profile.chats],
    }));

    setSidebarOpen(false);
    getActiveTextarea()?.focus();
  }

  function handleDeleteChat(chatId: string) {
    if (!window.confirm("Delete this chat?")) {
      return;
    }

    updateActiveProfile((profile) => {
      const remaining = profile.chats.filter((chat) => chat.id !== chatId);

      if (remaining.length === 0) {
        const fresh = createThread();

        return {
          ...profile,
          activeChatId: fresh.id,
          chats: [fresh],
        };
      }

      return {
        ...profile,
        activeChatId:
          profile.activeChatId === chatId ? remaining[0].id : profile.activeChatId,
        chats: remaining,
      };
    });
  }

  function moveChatToFolder(chatId: string, folderId: string | null) {
    updateActiveProfile((profile) => ({
      ...profile,
      chats: profile.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              folderId,
              updatedAt: nowIso(),
            }
          : chat
      ),
    }));
  }

  function handleExportBackup() {
    if (!state) {
      return;
    }

    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${BACKUP_FILE_PREFIX}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setNotice({
      kind: "success",
      text: "Backup downloaded with chats, memories, folders, and saved images.",
    });
  }

  async function handleRestoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    try {
      const restored = normalizePersistedState(JSON.parse(await file.text()));
      setState(restored);
      setNotice({ kind: "success", text: "Backup restored." });
      setSidebarOpen(false);
      setMobileMemoryOpen(false);
    } catch {
      setNotice({ kind: "error", text: "That backup file couldn’t be restored." });
    }
  }

  function handleSubmitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editorDialog) {
      return;
    }

    const name = editorDialog.value.trim();

    if (!name) {
      setNotice({ kind: "error", text: "Give it a name first." });
      return;
    }

    updateActiveProfile((profile) => ({
      ...profile,
      folders: [
        {
          id: makeId("folder"),
          name,
          createdAt: nowIso(),
        },
        ...profile.folders,
      ],
    }));

    setNotice({ kind: "success", text: `Folder “${name}” created.` });

    setEditorDialog(null);
  }

  function handleSuggestion(prompt: string, imageMode: boolean) {
    if (composer.trim() || queuedAttachments.length > 0) {
      setNotice({
        kind: "error",
        text: "Clear your current draft before using a sample prompt.",
      });
      getActiveTextarea()?.focus();
      return;
    }

    setComposer(prompt);

    if (imageMode) {
      composerModeRef.current = "image";
      setComposerMode("image");
      updateSettings({ imageMode: true });
    }

    getActiveTextarea()?.focus();
  }

  async function sendMessage() {
    if (!state || !activeProfile || !activeChat || isSending) {
      return;
    }

    const trimmedText = composer.trim();

    if (!trimmedText && queuedAttachments.length === 0) {
      return;
    }

    const text = trimmedText || "Please analyze this image.";
    const profileId = activeProfile.id;
    const chatId = activeChat.id;
    const createdAt = nowIso();
    const explicitImageMode = composerModeRef.current === "image";
    const shouldGenerateImage =
      queuedAttachments.length === 0 &&
      (explicitImageMode ||
        (state.settings.autoDetectImages && detectImageIntent(text)));
    const userMessage: ChatMessage = {
      id: makeId("message"),
      role: "user",
      text,
      createdAt,
      attachments: queuedAttachments,
      generatedImage: null,
      memoryWrites: [],
      mode: shouldGenerateImage ? "image" : "chat",
    };
    const nextMessages = [...activeChat.messages, userMessage].map(
      ({ role, text: messageText, attachments }, index, arr) => ({
        role,
        text: messageText,
        attachments: index === arr.length - 1 ? attachments : [],
      })
    ) satisfies ChatRequestPayload["messages"];
    const nextTitle =
      activeChat.title === "New chat" ? createTitleFromText(text) : activeChat.title;

    setImageMenuOpen(false);
    setComposer("");
    setQueuedAttachments([]);
    setIsSending(true);
    appendMessageToChat(profileId, chatId, userMessage, { title: nextTitle });

    let assistantDraftId: string | null = null;

    try {
      if (shouldGenerateImage) {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: text,
            profileName: activeProfile.name,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<ImageResponsePayload>)
          | null;

        if (!response.ok || !payload?.image) {
          throw new Error(payload?.error ?? "Image request failed.");
        }

        const imageData = payload.image;
        const compressedDataUrl = await compressImageToDataUrl(
          imageData.dataUrl
        ).catch(() => imageData.dataUrl);

        const assistantMessage: ChatMessage = {
          id: makeId("message"),
          role: "assistant",
          text: imageData.revisedPrompt
            ? `Generated with GPT Image 1.5.\n\n${imageData.revisedPrompt}`
            : "Generated with GPT Image 1.5.",
          createdAt: nowIso(),
          attachments: [],
          generatedImage: {
            dataUrl: compressedDataUrl,
            prompt: imageData.prompt,
            revisedPrompt: imageData.revisedPrompt,
          },
          memoryWrites: [],
          mode: "image",
        };

        appendMessageToChat(profileId, chatId, assistantMessage);
      } else {
        assistantDraftId = makeId("message");

        appendMessageToChat(profileId, chatId, {
          id: assistantDraftId,
          role: "assistant",
          text: "",
          createdAt: nowIso(),
          attachments: [],
          generatedImage: null,
          memoryWrites: [],
          mode: "chat",
        });

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            profileName: activeProfile.name,
            memories: activeProfile.memories,
            customInstructions: state.settings.customInstructions,
            messages: nextMessages,
          } satisfies ChatRequestPayload),
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<ChatResponsePayload>)
            | null;
          throw new Error(payload?.error ?? "Chat request failed.");
        }

        if (contentType.includes("application/x-ndjson")) {
          let streamedText = "";
          let streamedMemoryWrites: MemoryWrite[] = [];

          await readChatStream(response, (event) => {
            if (event.type === "delta") {
              streamedText += event.delta;

              if (assistantDraftId) {
                updateMessageInChat(profileId, chatId, assistantDraftId, (message) => ({
                  ...message,
                  text: streamedText,
                }));
              }
              return;
            }

            if (event.type === "done") {
              streamedText = event.text;
              streamedMemoryWrites = event.memoryWrites;

              if (assistantDraftId) {
                updateMessageInChat(
                  profileId,
                  chatId,
                  assistantDraftId,
                  (message) => ({
                    ...message,
                    text: event.text,
                    memoryWrites: event.memoryWrites,
                  }),
                  { memoryWrites: event.memoryWrites }
                );
              }
              return;
            }

            throw new Error(event.error);
          });

          if (streamedMemoryWrites.length > 0) {
            setNotice({
              kind: "success",
              text: `Saved ${streamedMemoryWrites.length} memory${
                streamedMemoryWrites.length === 1 ? "" : "ies"
              } locally.`,
            });
          }
        } else {
          const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<ChatResponsePayload>)
            | null;

          if (!payload?.text) {
            throw new Error(payload?.error ?? "Chat request failed.");
          }

          const memoryWrites = Array.isArray(payload.memoryWrites)
            ? payload.memoryWrites
            : [];

          if (assistantDraftId) {
            updateMessageInChat(
              profileId,
              chatId,
              assistantDraftId,
              (message) => ({
                ...message,
                text: payload.text ?? "",
                memoryWrites,
              }),
              { memoryWrites }
            );
          }

          if (memoryWrites.length > 0) {
            setNotice({
              kind: "success",
              text: `Saved ${memoryWrites.length} memory${
                memoryWrites.length === 1 ? "" : "ies"
              } locally.`,
            });
          }
        }
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Something went wrong.";

      if (assistantDraftId) {
        updateMessageInChat(profileId, chatId, assistantDraftId, (message) => ({
          ...message,
          text: message.text || errorText,
          error: errorText,
        }));
      } else {
        appendMessageToChat(profileId, chatId, {
          id: makeId("message"),
          role: "assistant",
          text: "",
          createdAt: nowIso(),
          attachments: [],
          generatedImage: null,
          memoryWrites: [],
          mode: shouldGenerateImage ? "image" : "chat",
          error: errorText,
        });
      }
    } finally {
      setIsSending(false);
    }
  }

  function renderChatGroup(label: string, folderId: string | null, chats: typeof filteredChats) {
    if (deferredSearch.trim() && chats.length === 0) {
      return null;
    }

    const isDropTarget = dropFolderId === folderId;

    return (
      <section
        key={label}
        className={`space-y-2 rounded-[20px] transition ${
          isDropTarget ? "bg-white/[0.04] p-2" : ""
        }`}
        onDragOver={(event) => {
          if (!draggedChatId) {
            return;
          }

          event.preventDefault();
          setDropFolderId(folderId);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropFolderId(undefined);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();

          const chatId = draggedChatId || event.dataTransfer.getData("text/chat-id");
          if (chatId) {
            moveChatToFolder(chatId, folderId);
          }

          setDraggedChatId(null);
          setDropFolderId(undefined);
        }}
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/35">
            <FolderClosed className="h-3.5 w-3.5" />
            <span>{label}</span>
          </div>
          <button
            type="button"
            onClick={() => handleCreateChat(folderId)}
            className="glass-control rounded-full p-1.5 text-white/60"
            aria-label={`Create chat in ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {chats.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/10 px-3 py-3 text-sm text-white/28">
              Nothing here yet.
            </div>
          ) : null}
          {chats.map((chat) => {
            const isActive = chat.id === activeChat?.id;
            const preview = chat.messages.at(-1)?.text || "Start something new";

            return (
              <div
                key={chat.id}
                className="group relative"
                draggable
                onDragStart={(event) => {
                  setDraggedChatId(chat.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/chat-id", chat.id);
                }}
                onDragEnd={() => {
                  setDraggedChatId(null);
                  setDropFolderId(undefined);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    updateActiveProfile((profile) => ({
                      ...profile,
                      activeChatId: chat.id,
                    }));
                    setSidebarOpen(false);
                  }}
                  className={`w-full rounded-[18px] border px-3 py-2.5 text-left transition ${
                    isActive
                      ? "border-white/14 bg-white/[0.085] shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
                      : "border-white/8 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.045]"
                  }`}
                >
                  <div className="truncate pr-8 text-sm font-medium text-white">
                    {chat.title}
                  </div>
                  <div className="mt-1 truncate pr-8 text-xs text-white/35">
                    {preview}
                  </div>
                  <div className="mt-2 text-[11px] text-white/25">
                    {formatRelativeTime(chat.updatedAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteChat(chat.id);
                  }}
                  className="absolute right-2 top-2 rounded-full p-1.5 text-white/0 transition group-hover:bg-black/30 group-hover:text-white/45 hover:!text-white"
                  aria-label={`Delete ${chat.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (!state || !activeProfile || !activeChat) {
    return <LoadingShell />;
  }

  const sidebarActions: SidebarAction[] = [
    {
      key: "new-chat",
      label: "New chat",
      icon: <MessageSquarePlus className="h-4 w-4" />,
      onClick: () => handleCreateChat(),
    },
    {
      key: "new-folder",
      label: "New folder",
      icon: <FolderPlus className="h-4 w-4" />,
      onClick: () => setEditorDialog({ value: "" }),
    },
    {
      key: "memories",
      label: "Memories",
      icon: <Brain className="h-4 w-4" />,
      onClick: () => {
        setSidebarOpen(false);
        setMobileMemoryOpen(true);
      },
    },
    {
      key: "settings",
      label: "Settings",
      icon: <SlidersHorizontal className="h-4 w-4" />,
      onClick: () => {
        setSidebarOpen(false);
        setSettingsOpen(true);
      },
    },
  ];

  return (
    <div className="relative h-[100dvh] overflow-hidden p-0 sm:p-3">
      <div className="flex h-full w-full items-stretch gap-0 sm:gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className={`fixed inset-0 z-30 bg-black/65 transition xl:hidden ${
            sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-label="Close sidebar overlay"
        />

        <aside
          className={`fixed inset-y-0 left-0 z-40 w-screen max-w-none transition-transform duration-200 sm:inset-y-3 sm:left-3 sm:w-[88vw] sm:max-w-[360px] xl:static xl:inset-auto xl:w-[320px] xl:shrink-0 xl:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-[110%]"
          }`}
        >
          <div className="glass-panel flex h-full flex-col overflow-hidden rounded-none p-2 sm:p-2.5 sm:rounded-[28px]">
            <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-3 sm:rounded-[24px] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="glass-control flex h-10 w-10 items-center justify-center rounded-[16px]">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-white">
                      {APP_NAME}
                    </div>
                    <p className="mt-0.5 text-xs text-white/34">
                      Mom and Aiden stay separate
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="glass-control rounded-full p-2 text-white/60 xl:hidden"
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5 sm:mt-4 sm:rounded-[20px] sm:px-4 sm:py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-white/34">
                  Active space
                </div>
                <div className="mt-1 text-sm font-medium text-white">{activeProfile.name}</div>
                <div className="mt-1 text-xs text-white/34">Locked to this space after unlock</div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
              {sidebarActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className="glass-control inline-flex items-center justify-center gap-2 rounded-[16px] px-3 py-2.5 text-sm font-medium text-white sm:rounded-[18px] sm:py-3"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            <label className="glass-control mt-2 flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-white/45 focus-within:border-white/18 focus-within:text-white/70 sm:mt-3 sm:rounded-[18px] sm:px-4 sm:py-3">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search chats"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/28 focus:outline-none"
              />
            </label>

            <div className="chat-scroll mt-2 flex-1 space-y-3 overflow-y-auto pr-1 sm:mt-3">
              {groupedChats.folderGroups.map((group) =>
                renderChatGroup(group.folder.name, group.folder.id, group.chats)
              )}
              {renderChatGroup("Unfiled", null, groupedChats.unfiled)}
            </div>

            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleRestoreBackup}
            />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1">
          <section className="chat-window relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-y-0 sm:rounded-[28px] sm:border-x sm:border-y">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="glass-control absolute left-3 top-3 z-10 rounded-full p-2 text-white/70 xl:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-h-0 flex-1 flex-col">
              {activeChat.messages.length === 0 ? (
                <div className="flex flex-1 flex-col justify-center px-4 pb-4 pt-16 sm:px-6 sm:pt-6">
                  <div className="mx-auto w-full max-w-3xl text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      How can I help?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-white/40">
                      Quick prompts, clean chat flow, and a tighter workspace.
                    </p>

                    <div className="mt-6 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion.title}
                          type="button"
                          onClick={() =>
                            handleSuggestion(suggestion.prompt, suggestion.imageMode)
                          }
                          className="glass-control rounded-[20px] p-4 text-left"
                        >
                          <div className="text-sm font-medium text-white">
                            {suggestion.title}
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-white/38">
                            {suggestion.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chat-scroll flex-1 overflow-y-auto px-2.5 pb-2 pt-14 sm:px-5 sm:pb-4 sm:pt-5">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
                    {activeChat.messages.map((message) => (
                      <MessageCard
                        key={message.id}
                        message={message}
                        userName={activeProfile.name}
                      />
                    ))}

                    {showThinking ? <TypingBubble /> : null}

                    <div ref={endRef} />
                  </div>
                </div>
              )}

              <div className="shrink-0 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-3 sm:pb-3">
                <div className="glass-panel-soft rounded-[26px] px-2.5 py-2.5 sm:rounded-[24px] sm:px-4 sm:py-3">
                  <div className="mb-2 hidden flex-wrap items-center gap-2 sm:mb-3 sm:flex">
                      <button
                        type="button"
                        onClick={() => {
                          const nextMode: ComposerMode =
                            composerModeRef.current === "image" ? "chat" : "image";
                          composerModeRef.current = nextMode;
                          setComposerMode(nextMode);
                          updateSettings({ imageMode: nextMode === "image" });
                        }}
                        className={`glass-control inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-white/74 ${
                          composerMode === "image" ? "glass-control--active text-white" : ""
                        }`}
                      >
                      <Sparkles className="h-4 w-4" />
                      Image mode
                    </button>

                    <button
                      type="button"
                      onClick={() => setMobileMemoryOpen(true)}
                      className="glass-control inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-white/72"
                    >
                      <Brain className="h-4 w-4" />
                      Memories
                    </button>

                    <label className="glass-select relative min-w-[140px] flex-1 sm:min-w-[170px] sm:flex-none">
                      <FolderClosed className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                      <select
                        value={activeChat.folderId ?? ""}
                        onChange={(event) => {
                          const nextFolderId = event.target.value || null;
                          updateActiveProfile((profile) => ({
                            ...profile,
                            chats: profile.chats.map((chat) =>
                              chat.id === profile.activeChatId
                                ? {
                                    ...chat,
                                    folderId: nextFolderId,
                                  }
                                : chat
                            ),
                          }));
                        }}
                        className="h-10 w-full pl-9 pr-10 text-sm text-white/76 focus:outline-none"
                      >
                        <option value="">Unfiled</option>
                        {activeProfile.folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                    </label>

                    {autoImageDetected ? (
                      <span className="glass-control rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/52">
                        Auto image
                      </span>
                    ) : null}
                  </div>

                  {queuedAttachments.length > 0 ? (
                    <div className="chat-scroll mb-2 flex gap-2 overflow-x-auto pb-1 sm:mb-3 sm:flex-wrap sm:overflow-visible sm:pb-0">
                      {queuedAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] p-1"
                        >
                          <img
                            src={attachment.dataUrl}
                            alt={attachment.name}
                            className="h-14 w-14 rounded-[14px] object-cover sm:h-16 sm:w-16"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQueuedAttachments((current) =>
                                current.filter((item) => item.id !== attachment.id)
                              )
                            }
                            className="absolute right-1.5 top-1.5 rounded-full bg-black/65 p-1 text-white transition hover:bg-black"
                            aria-label={`Remove ${attachment.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <div className="hidden items-end gap-1.5 sm:flex sm:gap-2">
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="glass-control inline-flex h-10 shrink-0 items-center gap-2 rounded-[14px] px-2.5 text-sm text-white/78 max-[380px]:px-2 sm:h-11 sm:rounded-[16px] sm:px-3"
                      >
                        <ImagePlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Image</span>
                      </button>

                      <div className="glass-control flex min-h-[48px] flex-1 items-end rounded-[18px] px-2.5 py-1.5 sm:min-h-[56px] sm:rounded-[20px] sm:px-3 sm:py-2">
                        <textarea
                          ref={desktopTextareaRef}
                          value={composer}
                          onChange={(event) => setComposer(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          onPaste={(event) => {
                            const imageFiles = Array.from(event.clipboardData.files).filter(
                              (file) => file.type.startsWith("image/")
                            );

                            if (imageFiles.length > 0) {
                              void queueFiles(imageFiles);
                            }
                          }}
                          rows={1}
                          placeholder={
                            willGenerateImage
                              ? "Describe the image you want..."
                              : queuedAttachments.length > 0
                                ? "Ask about these images..."
                                : `Message ${APP_NAME}...`
                          }
                          className="min-h-[34px] max-h-[15vh] w-full resize-none bg-transparent text-[14px] leading-6 text-white placeholder:text-white/26 focus:outline-none sm:min-h-[40px] sm:text-[15px] sm:leading-7"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={!canSend}
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[14px] bg-white px-3 text-sm font-medium text-black transition hover:scale-[1.01] hover:shadow-[0_18px_60px_rgba(255,255,255,0.16)] disabled:cursor-not-allowed disabled:opacity-50 max-[380px]:px-2.5 sm:h-11 sm:rounded-[16px] sm:px-4"
                      >
                        <span>{willGenerateImage ? "Create" : "Send"}</span>
                        <SendHorizontal className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-end gap-2 sm:hidden">
                      <div ref={imageMenuRef} className="relative shrink-0 self-end">
                        <button
                          type="button"
                          onClick={() => setImageMenuOpen((current) => !current)}
                          className={`glass-control inline-flex h-11 w-11 items-center justify-center rounded-[16px] text-sm text-white/78 shadow-[0_12px_32px_rgba(0,0,0,0.18)] ${
                            imageMenuOpen ? "glass-control--active text-white" : ""
                          }`}
                          aria-label="Open image options"
                        >
                          <ImagePlus className="h-4 w-4" />
                          <ChevronDown className={`h-3.5 w-3.5 transition ${imageMenuOpen ? "rotate-180" : ""}`} />
                        </button>

                        {imageMenuOpen ? (
                          <div className="glass-panel absolute bottom-full left-0 z-20 mb-2 flex min-w-[190px] flex-col gap-1 rounded-[18px] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
                            <button
                              type="button"
                              onClick={() => uploadInputRef.current?.click()}
                              className="glass-control flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm text-white/78"
                            >
                              <Upload className="h-4 w-4" />
                              Add image
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nextMode: ComposerMode =
                                  composerModeRef.current === "image" ? "chat" : "image";
                                composerModeRef.current = nextMode;
                                setComposerMode(nextMode);
                                updateSettings({ imageMode: nextMode === "image" });
                                setImageMenuOpen(false);
                              }}
                              className={`glass-control flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm ${
                                composerMode === "image" ? "glass-control--active text-white" : "text-white/78"
                              }`}
                            >
                              <Sparkles className="h-4 w-4" />
                              {composerMode === "image" ? "Image generation on" : "Image generation off"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="glass-control relative flex min-h-[58px] flex-1 items-end rounded-[24px] border-white/10 bg-white/[0.045] px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
                        <textarea
                          ref={mobileTextareaRef}
                          value={composer}
                          onChange={(event) => setComposer(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          onPaste={(event) => {
                            const imageFiles = Array.from(event.clipboardData.files).filter(
                              (file) => file.type.startsWith("image/")
                            );

                            if (imageFiles.length > 0) {
                              void queueFiles(imageFiles);
                            }
                          }}
                          rows={1}
                          placeholder={
                            willGenerateImage
                              ? "Describe the image you want..."
                              : queuedAttachments.length > 0
                                ? "Ask about these images..."
                                : `Message ${APP_NAME}...`
                          }
                          className="min-h-[40px] max-h-[24vh] w-full resize-none bg-transparent pr-12 pt-0.5 text-[16px] leading-[1.45] text-white placeholder:text-white/30 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!canSend}
                          className="absolute right-2.5 bottom-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14)] transition disabled:opacity-50"
                        >
                          <SendHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </form>

                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";

                      if (files.length > 0) {
                        void queueFiles(files);
                      }
                    }}
                  />

                  <div className="mt-2 hidden flex-wrap items-center justify-between gap-2 text-xs sm:flex">
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-white/46">
                      {willGenerateImage
                        ? "GPT Image 1.5"
                        : queuedAttachments.length > 0
                          ? "Vision chat"
                          : "Chat mode"}
                    </span>
                    <p className="hidden text-white/28 sm:block">
                      Chats, memories, folders, and saved images stay local in this browser.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <button
        type="button"
        onClick={() => setMobileMemoryOpen(false)}
        className={`fixed inset-0 z-40 bg-black/65 transition ${
          mobileMemoryOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Close memory drawer overlay"
      />

      <div
        className={`fixed inset-y-0 right-0 z-50 w-screen max-w-none transition-transform duration-200 sm:inset-y-3 sm:right-3 sm:w-[88vw] sm:max-w-[360px] ${
          mobileMemoryOpen ? "translate-x-0" : "translate-x-[110%]"
        }`}
      >
        <MemoryPanel
          profile={activeProfile}
          onDeleteMemory={(memoryId) =>
            updateActiveProfile((profile) => ({
              ...profile,
              memories: profile.memories.filter((memory) => memory.id !== memoryId),
            }))
          }
          onClose={() => setMobileMemoryOpen(false)}
        />
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen(false)}
        className={`fixed inset-0 z-40 bg-black/65 transition ${
          settingsOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Close settings overlay"
      />

      <div
        className={`fixed inset-y-0 right-0 z-50 w-screen max-w-none transition-transform duration-200 sm:inset-y-3 sm:right-3 sm:w-[88vw] sm:max-w-[420px] ${
          settingsOpen ? "translate-x-0" : "translate-x-[110%]"
        }`}
      >
        <aside className="glass-panel flex h-full flex-col overflow-hidden rounded-none sm:rounded-[32px]">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 p-4 sm:p-5">
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">Settings</div>
              <p className="mt-1 text-sm text-white/42">
                Local-only controls for this browser on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="glass-control rounded-full p-2 text-white/60"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="chat-scroll flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div className="glass-control rounded-[20px] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/36">
                Custom instructions
              </div>
              <textarea
                value={state.settings.customInstructions}
                onChange={(event) =>
                  updateSettings({ customInstructions: event.target.value })
                }
                rows={6}
                placeholder="Optional: set your own assistant rules or tone here."
                className="mt-3 min-h-28 w-full resize-y bg-transparent text-sm leading-6 text-white placeholder:text-white/28 focus:outline-none"
              />
            </div>

            <div className="glass-control rounded-[20px] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">Auto-detect image prompts</div>
                  <div className="mt-1 text-xs text-white/38">
                    Turn text prompts like "make an image" into image generation automatically.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ autoDetectImages: !state.settings.autoDetectImages })
                  }
                  className={`glass-control rounded-full px-3 py-2 text-sm ${
                    state.settings.autoDetectImages
                      ? "glass-control--active text-white"
                      : "text-white/72"
                  }`}
                >
                  {state.settings.autoDetectImages ? "On" : "Off"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="glass-control inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm text-white/78"
              >
                <Download className="h-4 w-4" />
                Backup
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="glass-control inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm text-white/78"
              >
                <Upload className="h-4 w-4" />
                Restore
              </button>
            </div>
          </div>
        </aside>
      </div>

      {editorDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4">
          <form
            onSubmit={handleSubmitEditor}
            className="glass-panel w-full max-w-md rounded-[32px] p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold tracking-tight text-white">New folder</div>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Group chats together and keep the sidebar tidy.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorDialog(null)}
                className="rounded-full border border-white/10 bg-white/6 p-2 text-white/60 transition hover:border-white/18 hover:bg-white/10 hover:text-white"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={dialogInputRef}
              value={editorDialog.value}
              onChange={(event) =>
                setEditorDialog((current) =>
                  current ? { ...current, value: event.target.value } : current
                )
              }
              placeholder="Family stuff"
              className="mt-5 w-full rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorDialog(null)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60 transition hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.01]"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
          <div
            className={`rounded-full border px-4 py-2 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${
              notice.kind === "success"
                ? "border-white/16 bg-white text-black"
                : "border-rose-300/18 bg-rose-500/12 text-rose-100"
            }`}
          >
            {notice.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-[100dvh] w-full items-center gap-0 p-0 sm:gap-3 sm:p-3">
      <div className="glass-panel hidden h-full w-[320px] rounded-[28px] xl:block" />
      <div className="chat-window h-full flex-1 rounded-none border-x-0 border-y-0 sm:rounded-[28px] sm:border-x sm:border-y" />
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="thinking-pill">
        <Sparkles className="h-3 w-3 animate-pulse text-white/48" />
        <span>Thinking</span>
        <div className="flex items-center gap-1">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(\*([^*]+)\*))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={`${match.index}-strong`}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(
        <code
          key={`${match.index}-code`}
          className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[0.95em]"
        >
          {match[3]}
        </code>
      );
    } else if (match[4] && match[5]) {
      nodes.push(
        <a
          key={`${match.index}-link`}
          href={match[5]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {match[4]}
        </a>
      );
    } else if (match[7]) {
      nodes.push(<em key={`${match.index}-em`}>{match[7]}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdownBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      blocks.push(<div key={`gap-${index}`} className="h-3" />);
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      index += 1;
      const codeLines: string[] = [];

      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-[13px] leading-6 text-white/86"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      const className =
        level === 1
          ? "text-[1.5rem] font-semibold leading-tight tracking-tight text-white"
          : level === 2
            ? "text-[1.2rem] font-semibold leading-tight text-white/96"
            : "text-[1rem] font-semibold leading-snug text-white/92";

      blocks.push(
        <div key={`h-${index}`} className={className}>
          {renderInlineMarkdown(content)}
        </div>
      );
      index += 1;
      continue;
    }

    if (/^(\d+)\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^(\d+)\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\d+)\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`olist-${index}`} className="space-y-2 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`} className="list-decimal leading-7">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^(-|\*)\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^(-|\*)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(-|\*)\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`list-${index}`} className="space-y-2 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`} className="list-disc leading-7">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^(-|\*)\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`} className="whitespace-pre-wrap text-[15px] leading-7">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>
    );
  }

  return blocks;
}

function MemoryPanel({
  profile,
  onDeleteMemory,
  onClose,
}: {
  profile: UserProfile;
  onDeleteMemory: (memoryId: string) => void;
  onClose?: () => void;
}) {
  return (
    <aside className="glass-panel flex h-full flex-col overflow-hidden rounded-[32px]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <Brain className="h-5 w-5" />
              Memories
            </div>
            <p className="mt-2 text-sm leading-6 text-white/42">
              Stable preferences, facts, and recurring context saved locally.
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/6 p-2 text-white/60 transition hover:border-white/18 hover:bg-white/10 hover:text-white xl:hidden"
              aria-label="Close memories"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2 text-xs text-white/45">
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2">
            {profile.memories.length} saved
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2">
            {profile.chats.length} chats
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {profile.memories.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/35">
            No memories saved yet. Ask the assistant to remember preferences, routines,
            or family context and they&rsquo;ll show up here.
          </div>
        ) : null}

        {profile.memories.map((memory) => (
          <article
            key={memory.id}
            className="rounded-[26px] border border-white/10 bg-white/[0.05] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/55">
                {capitalize(memory.category)}
              </span>
              <button
                type="button"
                onClick={() => onDeleteMemory(memory.id)}
                className="rounded-full p-1.5 text-white/35 transition hover:bg-black/30 hover:text-white"
                aria-label={`Delete memory ${memory.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 text-sm font-medium text-white">{memory.label}</div>
            <p className="mt-2 text-sm leading-6 text-white/48">{memory.value}</p>
            <div className="mt-3 text-xs text-white/28">
              Updated {formatRelativeTime(memory.updatedAt)}
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function MessageCard({
  message,
  userName,
}: {
  message: ChatMessage;
  userName: string;
}) {
  const isUser = message.role === "user";
  const label = isUser ? userName : APP_NAME;
  const text = message.error || message.text;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,720px)] rounded-[24px] border px-4 py-3 shadow-[0_16px_42px_rgba(0,0,0,0.16)] backdrop-blur-2xl ${
          isUser
            ? "border-white/10 bg-white/[0.09] text-white"
            : message.error
              ? "border-rose-300/18 bg-rose-500/10 text-rose-100"
              : "border-white/8 bg-white/[0.035] text-white"
        }`}
      >
        <div
          className={`mb-2.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] ${
            isUser ? "text-white/42" : "text-white/36"
          }`}
        >
          {isUser ? (
            <UserRound className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>{label}</span>
          <span>•</span>
          <span>{formatRelativeTime(message.createdAt)}</span>
        </div>

        {text ? <div className="space-y-2">{renderMarkdownBlocks(text)}</div> : null}

        {message.attachments.length > 0 ? (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={`overflow-hidden rounded-[20px] border ${
                  isUser ? "border-white/10" : "border-white/10"
                }`}
              >
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="max-h-[360px] w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}

        {message.generatedImage ? (
          <div className="mt-3 overflow-hidden rounded-[20px] border border-white/10 bg-black/30">
            <img
              src={message.generatedImage.dataUrl}
              alt={message.generatedImage.prompt}
              className="w-full object-cover"
            />
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/62">
              <div className="min-w-0 truncate">{message.generatedImage.prompt}</div>
              <a
                href={message.generatedImage.dataUrl}
                download="halo-chat-image.png"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-white transition hover:border-white/18 hover:bg-white/[0.14]"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </div>
          </div>
        ) : null}

        {message.memoryWrites.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.memoryWrites.map((memoryWrite) => (
              <span
                key={`${memoryWrite.category}:${memoryWrite.label}:${memoryWrite.value}`}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  isUser
                    ? "border-white/10 bg-white/[0.06] text-white/72"
                    : "border-white/10 bg-white/[0.06] text-white/68"
                }`}
              >
                Saved {memoryWrite.label}: {memoryWrite.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
