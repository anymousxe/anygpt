-- Halo Chat — Supabase SQL Schema
-- Paste this into the Supabase SQL Editor and run it.
-- Each "space" row represents one person's isolated data (Mom vs Aiden).
-- They never see each other's data because the frontend filters by space slug.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

------------------------------------------------------------
-- 1. SPACES  (one per person: "mom", "aiden")
------------------------------------------------------------
CREATE TABLE spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT    UNIQUE NOT NULL,          -- "mom" | "aiden"
  name        TEXT    NOT NULL,                 -- display name
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO spaces (slug, name) VALUES
  ('mom',   'Mom'),
  ('aiden', 'Aiden');

------------------------------------------------------------
-- 2. MEMORIES  (per-space, upserted by category+label)
------------------------------------------------------------
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,                    -- profile | preference | context | personal
  label       TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_id, category, label)
);

------------------------------------------------------------
-- 3. FOLDERS  (per-space)
------------------------------------------------------------
CREATE TABLE folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 4. CHATS  (per-space, optional folder)
------------------------------------------------------------
CREATE TABLE chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES folders(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 5. MESSAGES  (per-chat, ordered by created_at)
------------------------------------------------------------
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text            TEXT NOT NULL DEFAULT '',
  mode            TEXT NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat', 'image')),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 6. ATTACHMENTS  (per-message, stores compressed JPEG data-URL)
------------------------------------------------------------
CREATE TABLE attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Image',
  mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
  data_url    TEXT NOT NULL,                   -- base64 data-URL (compressed)
  sort_order  INT  NOT NULL DEFAULT 0
);

------------------------------------------------------------
-- 7. GENERATED IMAGES  (at most one per message)
------------------------------------------------------------
CREATE TABLE generated_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID UNIQUE NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  data_url        TEXT NOT NULL,               -- base64 data-URL (compressed)
  prompt          TEXT NOT NULL,
  revised_prompt  TEXT
);

------------------------------------------------------------
-- INDEXES
------------------------------------------------------------
CREATE INDEX idx_memories_space     ON memories (space_id);
CREATE INDEX idx_folders_space      ON folders  (space_id);
CREATE INDEX idx_chats_space        ON chats    (space_id);
CREATE INDEX idx_chats_folder       ON chats    (folder_id);
CREATE INDEX idx_messages_chat      ON messages (chat_id);
CREATE INDEX idx_attachments_msg    ON attachments (message_id);
CREATE INDEX idx_gen_images_msg     ON generated_images (message_id);

------------------------------------------------------------
-- 8. HELPER: upsert_memory()
------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_memory(
  p_space_id UUID,
  p_category TEXT,
  p_label    TEXT,
  p_value    TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO memories (space_id, category, label, value)
    VALUES (p_space_id, p_category, p_label, p_value)
    ON CONFLICT (space_id, category, label)
    DO UPDATE SET value     = EXCLUDED.value,
                  updated_at = now()
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

------------------------------------------------------------
-- 9. ROW LEVEL SECURITY  (optional but recommended)
------------------------------------------------------------
-- If you enable RLS, add policies that let each "space"
-- only read/write its own rows. For now, the frontend
-- simply filters by space slug, so RLS is optional.

-- ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------
-- DONE
------------------------------------------------------------
-- Next steps:
-- 1. Install supabase-js:  npm install @supabase/supabase-js
-- 2. Add SUPABASE_URL + SUPABASE_ANON_KEY to .env.local
-- 3. Replace localStorage persistence in src/lib/app-state.ts
--    with Supabase CRUD (load on mount, save on change).
-- 4. The proxy/auth flow stays the same — just add a space
--    selector on the unlock page so Mom and Aiden each land
--    in their own space.
