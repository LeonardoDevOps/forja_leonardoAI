import { afterEach, describe, it, expect, vi } from "vitest";
import { transcribeAudio } from "../../src/media/transcribe";

describe("transcribeAudio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Workers AI Whisper with base64 audio + returns text", async () => {
    const calls: any[] = [];
    const fakeEnv: any = {
      AI: {
        run: async (model: string, input: any) => {
          calls.push({ model, input });
          return { text: "hola que tal" };
        },
      },
    };
    // mock global fetch for the audio download
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const result = await transcribeAudio("https://x/audio.ogg", fakeEnv);
    expect(result.text).toBe("hola que tal");
    expect(calls[0].model).toBe("@cf/openai/whisper-large-v3-turbo");
    // whisper-large-v3-turbo expects a base64 STRING (per Cloudflare docs), not bytes.
    expect(typeof calls[0].input.audio).toBe("string");
    // bytes [1,2,3] -> base64 "AQID"
    expect(calls[0].input.audio).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("rejects private audio URLs before making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(transcribeAudio("http://127.0.0.1/private.ogg", {} as any)).rejects.toThrow("media URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
