import type { ModelMessage } from "ai";
import { assertSafeExternalMediaUrl, type MediaUrlPolicy } from "./urlPolicy";

export function buildMultimodalUserMessage(
  text: string | undefined,
  imageUrl: string | undefined,
  policy: MediaUrlPolicy,
): ModelMessage {
  if (!imageUrl) {
    return { role: "user", content: text ?? "" };
  }
  return {
    role: "user",
    content: [
      { type: "image", image: assertSafeExternalMediaUrl(imageUrl, policy) },
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
  };
}
