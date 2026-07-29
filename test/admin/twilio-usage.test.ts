import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTwilioUsage } from "../../src/admin/twilioUsage";
import { makeAdminEnv } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchTwilioUsage", () => {
  it("returns unavailable without credentials and never calls the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTwilioUsage(makeAdminEnv())).resolves.toMatchObject({
      available: false,
      total: 0,
      categories: [],
      period: "ThisMonth",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unsuccessful HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );

    await expect(
      fetchTwilioUsage(
        makeAdminEnv(undefined, {
          TWILIO_ACCOUNT_SID: "AC-fake",
          TWILIO_AUTH_TOKEN: "token-fake",
        }),
      ),
    ).resolves.toMatchObject({
      available: false,
      error: "Twilio respondió HTTP 503",
    });
  });

  it("reports Error and non-Error network failures", async () => {
    const env = makeAdminEnv(undefined, {
      TWILIO_ACCOUNT_SID: "AC-fake",
      TWILIO_AUTH_TOKEN: "token-fake",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    await expect(fetchTwilioUsage(env)).resolves.toMatchObject({
      available: false,
      error: "timeout",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "offline";
      }),
    );
    await expect(fetchTwilioUsage(env)).resolves.toMatchObject({
      available: false,
      error: "error desconocido",
    });
  });

  it("accepts a response without usage_records as an empty available period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );

    await expect(
      fetchTwilioUsage(
        makeAdminEnv(undefined, {
          TWILIO_ACCOUNT_SID: "AC-fake",
          TWILIO_AUTH_TOKEN: "token-fake",
        }),
        "Today",
      ),
    ).resolves.toEqual({
      available: true,
      total: 0,
      messagingTotal: 0,
      numbersTotal: 0,
      waConversations: 0,
      categories: [],
      period: "Today",
    });
  });

  it("aggregates paid categories, ignores zero prices and sorts descending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          usage_records: [
            {
              category: "phonenumbers-local",
              usage: "1",
              usage_unit: "count",
              price: "1.25",
            },
            {
              category: "channels-whatsapp",
              usage: "7",
              usage_unit: "conversations",
              price: "2.50",
            },
            {
              category: "channels-messaging",
              usage: "bad",
              usage_unit: "messages",
              price: "4.75",
            },
            {
              category: "custom-category",
              usage: "bad",
              usage_unit: "events",
              price: "bad",
            },
          ],
        }),
      ),
    );

    const result = await fetchTwilioUsage(
      makeAdminEnv(undefined, {
        TWILIO_ACCOUNT_SID: "AC-fake",
        TWILIO_AUTH_TOKEN: "token-fake",
      }),
      "LastMonth",
    );

    expect(result).toMatchObject({
      available: true,
      total: 8.5,
      messagingTotal: 7.25,
      numbersTotal: 1.25,
      waConversations: 7,
      period: "LastMonth",
    });
    expect(result.categories.map((category) => category.price)).toEqual([4.75, 2.5, 1.25]);
    expect(result.categories[0]).toMatchObject({
      label: "Mensajes (Twilio)",
      usage: 0,
    });
    expect(result.categories.some((category) => category.category === "custom-category")).toBe(false);
  });

  it("builds period URL and Basic authorization from fictitious credentials", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ usage_records: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchTwilioUsage(
      makeAdminEnv(undefined, {
        TWILIO_ACCOUNT_SID: "AC-demo",
        TWILIO_AUTH_TOKEN: "token-demo",
      }),
      "Today",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/Accounts/AC-demo/Usage/Records/Today.json?PageSize=250");
    expect((init as RequestInit).headers).toEqual({
      Authorization: `Basic ${btoa("AC-demo:token-demo")}`,
    });
  });
});
