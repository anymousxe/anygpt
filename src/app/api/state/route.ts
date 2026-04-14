import { NextResponse } from "next/server";

import { isAuthorizedRequest, readSpaceCookie } from "@/lib/access";
import { createInitialState, normalizePersistedState } from "@/lib/app-state";
import { getLocalDatabasePath, loadStateForSpace, saveStateForSpace } from "@/lib/local-db";
import type { PersistedState } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const space = readSpaceCookie(request);
  const stored = loadStateForSpace(space);

  return NextResponse.json({
    space,
    dbPath: getLocalDatabasePath(),
    state: stored ? normalizePersistedState(stored) : null,
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { state?: PersistedState };
  const state = body?.state ? normalizePersistedState(body.state) : createInitialState();
  const space = readSpaceCookie(request);

  saveStateForSpace(space, state);

  return NextResponse.json({ ok: true, space, dbPath: getLocalDatabasePath() });
}
