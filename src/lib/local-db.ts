import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

const DB_DIR = path.join(process.cwd(), "local-data");
const DB_PATH = path.join(DB_DIR, "halo-chat.db");

type SpaceSlug = "mom" | "aiden";

let database: Database.Database | null = null;

function getDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(DB_DIR, { recursive: true });

  database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      space TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  return database;
}

export function getLocalDatabasePath() {
  return DB_PATH;
}

export function loadStateForSpace(space: SpaceSlug) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT state_json FROM spaces WHERE space = ?")
    .get(space) as { state_json?: string } | undefined;

  if (!row?.state_json) {
    return null;
  }

  return JSON.parse(row.state_json) as unknown;
}

export function saveStateForSpace(space: SpaceSlug, state: unknown) {
  const db = getDatabase();

  db.prepare(
    `
      INSERT INTO spaces (space, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(space) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `
  ).run(space, JSON.stringify(state), new Date().toISOString());
}
