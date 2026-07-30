import { describe, expect, it } from "vitest";
import { timingSafeEqual, twilioExpectedSignature } from "../src/http-auth";

describe("timingSafeEqual", () => {
  it("accepts identical UTF-8 strings", () => {
    expect(timingSafeEqual("secreto-ñ-🔐", "secreto-ñ-🔐")).toBe(true);
  });

  it("rejects changed bytes and different lengths", () => {
    expect(timingSafeEqual("webhook-secret", "webhook-secreu")).toBe(false);
    expect(timingSafeEqual("webhook-secret", "webhook-secret-extra")).toBe(false);
  });
});

describe("twilioExpectedSignature", () => {
  const url = "https://example.com/myapp.php?foo=1&bar=2";
  const params = [
    ["Digits", "1234"],
    ["To", "+18005551212"],
    ["From", "+14158675310"],
    ["Caller", "+14158675310"],
    ["CallSid", "CA1234567890ABCDE"],
  ] as const;

  it("matches Twilio's published HMAC-SHA1 test vector", async () => {
    await expect(twilioExpectedSignature(url, params, "12345")).resolves.toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
  });

  it("is independent of incoming form parameter order", async () => {
    const reversed = [...params].reverse();
    await expect(twilioExpectedSignature(url, reversed, "12345")).resolves.toBe(
      await twilioExpectedSignature(url, params, "12345"),
    );
  });

  it("changes when a signed value changes", async () => {
    const changed = params.map(([name, value]) =>
      name === "Digits" ? ([name, "9999"] as const) : ([name, value] as const),
    );
    await expect(twilioExpectedSignature(url, changed, "12345")).resolves.not.toBe(
      await twilioExpectedSignature(url, params, "12345"),
    );
  });
});
