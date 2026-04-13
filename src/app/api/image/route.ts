import OpenAI from "openai";
import { NextResponse } from "next/server";

import { isAuthorizedRequest } from "@/lib/access";
import type { ImageRequestPayload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function dataUrlToUploadable(dataUrl: string, index: number) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image attachment.");
  }

  const mimeType = match[1];
  const base64 = match[2];
  const extension = mimeType.split("/")[1] || "png";
  const bytes = Buffer.from(base64, "base64");

  return new File([bytes], `reference-${index + 1}.${extension}`, { type: mimeType });
}

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
    const response = attachments.length > 0
      ? await client.images.edit({
          model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
          image: attachments.map((attachment, index) =>
            dataUrlToUploadable(attachment.dataUrl, index)
          ),
          prompt,
          input_fidelity: "high",
          background: "auto",
          output_format: "png",
          quality: "high",
          size: "auto",
        })
      : await client.images.generate({
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
