import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchText } from "./util";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchText", () => {
  it("retries a 429 and returns the body of the later success", async () => {
    const waits: number[] = [];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response("<rss/>", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchText("https://venturebeat.com/feed/", 1000, (ms) => { waits.push(ms); return Promise.resolve(); })).resolves.toBe(
      "<rss/>",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([1000]);
  });

  it("gives up with HTTP 429 after the last retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 429 })),
    );
    await expect(fetchText("https://example.com/feed", 1000, async () => {})).rejects.toThrow("HTTP 429");
  });
});
