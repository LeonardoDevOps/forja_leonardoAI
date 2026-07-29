import type { Env } from "../env";
import { fetchSafeExternalMedia, readMediaBytes, type MediaUrlPolicy } from "./urlPolicy";

export interface TranscriptionResult {
  text: string;
  durationSeconds?: number;
}

function isTranscriptionResult(value: unknown): value is { text?: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function transcribeAudio(
  audioUrl: string,
  env: Env,
  policy: MediaUrlPolicy,
): Promise<TranscriptionResult> {
  const res = await fetchSafeExternalMedia(audioUrl, policy);
  if (!res.ok) throw new Error(`audio fetch failed: ${res.status}`);
  const buffer = await readMediaBytes(res);
  // whisper-large-v3-turbo expects a base64-encoded string in `audio` (per the
  // Cloudflare Workers AI docs), NOT a raw byte array. nodejs_compat is enabled
  // (see wrangler.toml) so Buffer is available, matching the official example.
  const base64 = Buffer.from(buffer).toString("base64");
  const result: unknown = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
    audio: base64,
  });
  return {
    text: isTranscriptionResult(result) && typeof result.text === "string" ? result.text : "",
  };
}
