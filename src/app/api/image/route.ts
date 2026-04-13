import OpenAI from "openai";
import { NextResponse } from "next/server";

import { isAuthorizedRequest } from "@/lib/access";
import { generateImageWithFallback } from "@/lib/image-generation";
import type { ImageRequestPayload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!isAuthorizedRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const body = (await request.json()) as Partial<ImageRequestPayload>;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.filter(
          (attachment): attachment is NonNullable<ImageRequestPayload["attachments"]>[number] =>
            Boolean(attachment?.dataUrl)
        )
      : [];

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const image = await generateImageWithFallback(client, prompt, attachments);

    return NextResponse.json({
      image: {
        dataUrl: image.dataUrl,
        prompt: image.prompt,
        revisedPrompt: image.revisedPrompt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: `Image generation failed: ${message}`,
      },
      { status: 500 }
    );
  }
}
