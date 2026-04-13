const GENERATION_TRIGGER =
  /\b(generate|create|draw|design|render|illustrate|sketch|paint|craft|mock\s?up|turn this into|make)\b/i;

const IMAGE_TRIGGER =
  /\b(image|picture|photo|portrait|wallpaper|logo|poster|illustration|drawing|painting|render|artwork|cover art|avatar|banner|icon|thumbnail|scene|mockup)\b/i;

const ANALYSIS_TRIGGER =
  /\b(analy[sz]e|describe|explain|identify|read|ocr|transcribe|what(?:'s| is) in|look at|tell me about this image)\b/i;

export function detectImageIntent(input: string) {
  const text = input.trim();

  if (!text) {
    return false;
  }

  if (ANALYSIS_TRIGGER.test(text) && !GENERATION_TRIGGER.test(text)) {
    return false;
  }

  return (
    (GENERATION_TRIGGER.test(text) && IMAGE_TRIGGER.test(text)) ||
    /\b(image of|photo of|poster for|logo for|wallpaper of)\b/i.test(text)
  );
}
