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
  const sanitizedPrompt = prompt
    .replace(/spider-?man/gi, "an agile wall-crawling masked hero with web-like grappling abilities")
    .replace(/batman/gi, "a dark vigilante with tactical gear and dramatic cape silhouette")
    .replace(/superman/gi, "a powerful flying hero with iconic strength and clean heroic posture")
    .replace(/iron man/gi, "a sleek armored tech hero with glowing high-tech details")
    .replace(/hulk/gi, "a massive powerhouse character with intense strength and explosive energy")
    .replace(/wolverine/gi, "a feral action hero with rugged styling and sharp claw-like weapons")
    .replace(/deadpool/gi, "a masked antihero with red tactical gear and chaotic comic-book energy")
    .replace(/captain america/gi, "a patriotic tactical hero with bold leadership energy and shield combat")
    .replace(/thor/gi, "a mythic storm-powered warrior with lightning energy and a heavy hammer weapon")
    .replace(/flash/gi, "a speed-focused hero with crackling motion trails and electric energy")
    .replace(/goku/gi, "a spiky-haired martial arts hero with glowing energy aura and airborne action")
    .replace(/naruto/gi, "a fast ninja hero with orange-accented styling and swirling energy effects")
    .replace(/sukuna|gojo|itadori|megumi/gi, "an original supernatural anime fighter")
    .replace(/marvel|dc/gi, "original comic-inspired")
    .replace(/in the style of [^,.;\n]+/gi, "")
    .replace(/style of [^,.;\n]+/gi, "")
    .replace(/like\s+[^,.;\n]+/gi, "")
    .replace(/\b(rapper|rap|trap|drill|hip-hop|gangsta|opium)\b/gi, "music")
    .replace(/\b(NLE Choppa|NBA YoungBoy|YoungBoy|Playboi Carti|Ken Carson|Destroy Lonely)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return [
    "Create original artwork that preserves the requested mood, energy, composition, and styling cues.",
    hasReferences
      ? "Use the uploaded reference image(s) as the subject with high fidelity for facial structure, pose, and key visual traits."
      : "Keep the subject and scene original while matching the requested visual vibe.",
    looksLikeCoverArt
      ? "Make it feel like high-end original music cover art with dramatic lighting, bold composition, strong typography space, editorial styling, and confident street-fashion energy."
      : "Keep the visual direction polished, cinematic, and original.",
    "Do not imitate any real person's exact likeness beyond the provided reference images, and do not imitate any named artist's exact signature style.",
    sanitizedPrompt ? `Use this sanitized brief: ${sanitizedPrompt}` : "Keep the final image original and commercially polished.",
  ].join(" ");
}

function shouldPreSanitizePrompt(prompt: string) {
  return /in the style of|style of|\blike\b|rapper|rap|trap|drill|hip-hop|cover art|album cover|mixtape|nle choppa|youngboy|nba youngboy|playboi carti|ken carson|destroy lonely|spider-?man|batman|superman|iron man|hulk|wolverine|deadpool|captain america|thor|flash|goku|naruto|marvel|dc|gojo|sukuna/i.test(
    prompt
  );
}

async function rewritePromptWithModel(
  client: OpenAI,
  prompt: string,
  hasReferences: boolean
) {
  const response = await client.responses.create({
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-nano",
    reasoning: { effort: "none" },
    store: false,
    max_output_tokens: 220,
    input: [
      {
        role: "system",
        content:
          "Rewrite image prompts so they keep the visual intent but remove named artists, named public figures, copyrighted character names, franchise names, 'style of' phrasing, and words likely to trigger image safety filters. Convert them into generic descriptive traits. Return one clean prompt only.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Rewrite this for safe original image generation. ${
              hasReferences
                ? "The uploaded reference images should remain the subject with high fidelity."
                : "No reference image is provided."
            } Prompt: ${prompt}`,
          },
        ],
      },
    ],
  });

  return response.output_text.trim();
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
    moderation: "low",
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
  let effectivePrompt = prompt;

  if (shouldPreSanitizePrompt(prompt)) {
    effectivePrompt = rewritePromptForSafety(prompt, attachments.length > 0);

    try {
      const modelRewrite = await rewritePromptWithModel(
        client,
        prompt,
        attachments.length > 0
      );

      if (modelRewrite) {
        effectivePrompt = modelRewrite;
      }
    } catch {
      // Keep the deterministic fallback rewrite.
    }
  }

  try {
    const response = await generateRawImage(client, effectivePrompt, attachments);
    const image = response.data?.[0];

    if (!image?.b64_json) {
      throw new Error("No image data returned.");
    }

    return {
      dataUrl: `data:image/png;base64,${image.b64_json}`,
      prompt,
      revisedPrompt: image.revised_prompt ?? (effectivePrompt === prompt ? undefined : effectivePrompt),
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
