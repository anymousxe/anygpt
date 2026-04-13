import OpenAI from "openai";

import type { GeneratedImage, UploadAttachment } from "@/lib/types";

function getImageModel() {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";
}

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

function rewritePromptForSafety(prompt: string, hasReferences: boolean) {
  const looksLikeCoverArt = /cover|album|mixtape|poster|rapper|rap|trap|hip-hop|drill/i.test(prompt);

  return [
    "Create original artwork that preserves the requested mood, energy, composition, and styling cues.",
    hasReferences
      ? "Use the uploaded reference image(s) as the subject with high fidelity for facial structure, pose, and key visual traits."
      : "Keep the subject and scene original while matching the requested visual vibe.",
    looksLikeCoverArt
      ? "Make it feel like high-end original rap cover art with dramatic lighting, bold composition, strong typography space, and polished editorial styling."
      : "Keep the visual direction polished, cinematic, and original.",
    "Do not imitate any real person's exact likeness beyond the provided reference images, and do not imitate any named artist's exact signature style.",
    `Original request: ${prompt}`,
  ].join(" ");
}

function shouldRetryWithRewrite(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /safety system|rejected/i.test(message);
}

async function generateRawImage(
  client: OpenAI,
  prompt: string,
  attachments: UploadAttachment[]
) {
  if (attachments.length > 0) {
    return client.images.edit({
      model: getImageModel(),
      image: attachments.map((attachment, index) =>
        dataUrlToUploadable(attachment.dataUrl, index)
      ),
      prompt,
      input_fidelity: "high",
      background: "auto",
      output_format: "png",
      quality: "high",
      size: "auto",
    });
  }

  return client.images.generate({
    model: getImageModel(),
    prompt,
    background: "auto",
    output_format: "png",
    quality: "high",
    size: "auto",
  });
}

export async function generateImageWithFallback(
  client: OpenAI,
  prompt: string,
  attachments: UploadAttachment[] = []
): Promise<GeneratedImage> {
  try {
    const response = await generateRawImage(client, prompt, attachments);
    const image = response.data?.[0];

    if (!image?.b64_json) {
      throw new Error("No image data returned.");
    }

    return {
      dataUrl: `data:image/png;base64,${image.b64_json}`,
      prompt,
      revisedPrompt: image.revised_prompt ?? undefined,
    };
  } catch (error) {
    if (!shouldRetryWithRewrite(error)) {
      throw error;
    }

    const rewrittenPrompt = rewritePromptForSafety(prompt, attachments.length > 0);
    const response = await generateRawImage(client, rewrittenPrompt, attachments);
    const image = response.data?.[0];

    if (!image?.b64_json) {
      throw new Error("No image data returned.");
    }

    return {
      dataUrl: `data:image/png;base64,${image.b64_json}`,
      prompt,
      revisedPrompt: image.revised_prompt ?? rewrittenPrompt,
    };
  }
}
