import { describe, expect, it, vi } from "vitest";
import {
  assertSafeExternalMediaUrl,
  fetchSafeExternalMedia,
  readMediaBytes,
} from "../../src/media/urlPolicy";

describe("external media URL policy", () => {
  it("accepts ordinary public HTTPS URLs", () => {
    expect(assertSafeExternalMediaUrl("https://cdn.example.com/audio.ogg").href).toBe(
      "https://cdn.example.com/audio.ogg",
    );
  });

  it.each([
    "http://cdn.example.com/audio.ogg",
    "https://localhost/audio.ogg",
    "https://127.0.0.1/audio.ogg",
    "https://10.0.0.8/audio.ogg",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/audio.ogg",
    "https://user:pass@cdn.example.com/audio.ogg",
    "https://cdn.example.com:8443/audio.ogg",
  ])("rejects unsafe media location %s", (url) => {
    expect(() => assertSafeExternalMediaUrl(url)).toThrow();
  });

  it("validates redirect targets before following them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      }),
    );

    await expect(fetchSafeExternalMedia("https://cdn.example.com/audio.ogg")).rejects.toThrow("media URL");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("stops reading media that exceeds the byte limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readMediaBytes(response, 3)).rejects.toThrow("too large");
  });
});
