import OpenAI from "openai";
import { NextResponse } from "next/server";

import { isAuthorizedRequest } from "@/lib/access";
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

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
      prompt,
      background: "auto",
      output_format: "png",
      quality: "high",
      size: "auto",
    });

    const image = response.data?.[0];

    if (!image?.b64_json) {
      throw new Error("No image data returned.");
    }

    return NextResponse.json({
      image: {
        dataUrl: `data:image/png;base64,${image.b64_json}`,
        prompt,
        revisedPrompt: image.revised_prompt ?? undefined,
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
