import { describe, it, expect } from "vitest";
import { twilioAdapter } from "../../src/channels/twilio";

describe("twilioAdapter.parseIncoming", () => {
  it("parses text WA", async () => {
    const body = new URLSearchParams({
      From: "whatsapp:+5215512345",
      To: "whatsapp:+5215587654",
      Body: "hola",
      ProfileName: "María",
      NumMedia: "0",
    });
    const req = new Request("https://x", { method: "POST", body });
    const msg = await twilioAdapter.parseIncoming(req, {} as any);
    expect(msg.channel).toBe("twilio");
    expect(msg.channelUserId).toBe("+5215512345");
    expect(msg.text).toBe("hola");
    expect(msg.displayName).toBe("María");
  });

  it("parses image attachment", async () => {
    const body = new URLSearchParams({
      From: "whatsapp:+5215512345",
      To: "whatsapp:+5215587654",
      Body: "ese corte",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123",
      MediaContentType0: "image/jpeg",
    });
    const req = new Request("https://x", { method: "POST", body });
    const msg = await twilioAdapter.parseIncoming(req, {} as any);
    expect(msg.imageUrl).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123");
    expect(msg.text).toBe("ese corte");
  });

  it("parses audio attachment", async () => {
    const body = new URLSearchParams({
      From: "whatsapp:+5215512345",
      To: "whatsapp:+5215587654",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME456",
      MediaContentType0: "audio/ogg",
    });
    const req = new Request("https://x", { method: "POST", body });
    const msg = await twilioAdapter.parseIncoming(req, {} as any);
    expect(msg.audioUrl).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME456");
  });

  it("drops media from a host that only contains the Twilio name", async () => {
    const body = new URLSearchParams({
      From: "whatsapp:+5215512345",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com.attacker.test/voice.ogg",
      MediaContentType0: "audio/ogg",
    });
    const req = new Request("https://x", { method: "POST", body });
    const msg = await twilioAdapter.parseIncoming(req, {} as any);
    expect(msg.audioUrl).toBeUndefined();
    expect(msg.imageUrl).toBeUndefined();
  });
});
