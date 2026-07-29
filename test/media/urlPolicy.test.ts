import { describe, expect, it, vi } from "vitest";
import {
  assertSafeExternalMediaUrl,
  createMediaUrlPolicy,
  fetchSafeExternalMedia,
  isSafeExternalMediaUrl,
  mediaHostPolicyFor,
  readMediaBytes,
} from "../../src/media/urlPolicy";

describe("external media URL policy", () => {
  const policy = createMediaUrlPolicy(["cdn.example.com", "redirect.example.com"]);

  it("accepts an exact approved public HTTPS hostname", () => {
    expect(assertSafeExternalMediaUrl("https://cdn.example.com/audio.ogg", policy).href).toBe(
      "https://cdn.example.com/audio.ogg",
    );
  });

  it("normalizes hostname case and a trailing DNS dot", () => {
    expect(
      assertSafeExternalMediaUrl(
        "https://CDN.EXAMPLE.COM./audio.ogg",
        createMediaUrlPolicy(["CDN.EXAMPLE.COM."]),
      ).hostname,
    ).toBe("cdn.example.com.");
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
    expect(() => assertSafeExternalMediaUrl(url, policy)).toThrow();
  });

  it.each([
    "https://cdn.example.com.attacker.test/audio.ogg",
    "https://sub.cdn.example.com/audio.ogg",
    "https://other.example.com/audio.ogg",
  ])("rejects a public but unapproved hostname %s", (url) => {
    expect(() => assertSafeExternalMediaUrl(url, policy)).toThrow("not allowed");
  });

  it("fails closed with an empty policy", () => {
    expect(isSafeExternalMediaUrl("https://cdn.example.com/audio.ogg", createMediaUrlPolicy([]))).toBe(false);
  });

  it("validates redirect targets before following them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      }),
    );

    await expect(fetchSafeExternalMedia("https://cdn.example.com/audio.ogg", policy)).rejects.toThrow(
      "media URL",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("follows redirects only when every destination is approved", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://redirect.example.com/final.ogg" },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));

    const response = await fetchSafeExternalMedia("https://cdn.example.com/audio.ogg", policy);
    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("rejects malformed MEDIA_ALLOWED_HOSTS entries instead of weakening the policy", () => {
    for (const value of [
      "*.example.com",
      "https://cdn.example.com",
      "cdn.example.com:443",
      "cdn.example.com/path",
      "localhost",
    ]) {
      expect(() =>
        mediaHostPolicyFor("manychat", {
          DASHBOARD_BASE_URL: "https://bot.example.com",
          MEDIA_ALLOWED_HOSTS: value,
        }),
      ).toThrow("MEDIA_ALLOWED_HOSTS");
    }
  });

  it("builds channel-specific policies without widening fixed providers", () => {
    const env = {
      DASHBOARD_BASE_URL: "https://bot.example.com",
      MEDIA_ALLOWED_HOSTS: "cdn.example.com, CDN.EXAMPLE.COM.",
    };
    expect(
      isSafeExternalMediaUrl("https://api.telegram.org/file/x", mediaHostPolicyFor("telegram", env)),
    ).toBe(true);
    expect(isSafeExternalMediaUrl("https://cdn.example.com/file", mediaHostPolicyFor("telegram", env))).toBe(
      false,
    );
    expect(isSafeExternalMediaUrl("https://api.twilio.com/media/x", mediaHostPolicyFor("twilio", env))).toBe(
      true,
    );
    expect(
      isSafeExternalMediaUrl("https://bot.example.com/media/x", mediaHostPolicyFor("whatsapp", env)),
    ).toBe(true);
    expect(
      isSafeExternalMediaUrl("https://cdn.example.com/media/x", mediaHostPolicyFor("manychat", env)),
    ).toBe(true);
  });

  it("stops reading media that exceeds the byte limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readMediaBytes(response, 3)).rejects.toThrow("too large");
  });
});
