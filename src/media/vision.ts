import type { ModelMessage } from "ai";
import { assertSafeExternalMediaUrl } from "./urlPolicy";

export function buildMultimodalUserMessage(
  text: string | undefined,
  imageUrl: string | undefined,
): ModelMessage {
  if (!imageUrl) {
    return { role: "user", content: text ?? "" };
  }
  return {
    role: "user",
    content: [
      { type: "image", image: assertSafeExternalMediaUrl(imageUrl) },
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
  };
}
