import { describe, expect, it, vi } from "vitest";
import {
  createImageSearchTool,
  createWebFetchTool,
  createWebSearchTool,
  WEB_SEARCH_DEFAULT_COUNT,
  WEB_SEARCH_MAX_COUNT,
} from "../tools.ts";
import type { IflowClient } from "../client.ts";

function mockClient(overrides: Partial<IflowClient> = {}): IflowClient {
  return {
    webSearch: vi.fn(async () => ({
      ok: true as const,
      fromCache: false,
      tookMs: 5,
      data: {
        success: true,
        code: "200",
        message: "ok",
        data: {
          query: "hi",
          organic: [{ title: "T", link: "https://x", snippet: "s", position: 1, date: null }],
        },
      },
    })),
    imageSearch: vi.fn(async () => ({
      ok: true as const,
      fromCache: false,
      tookMs: 5,
      data: { success: true, code: "200", message: "ok", data: [{ url: "https://i.jpg", title: "T", refUrl: "https://src" }] },
    })),
    webFetch: vi.fn(async () => ({
      ok: true as const,
      fromCache: false,
      tookMs: 5,
      data: { success: true, code: "200", message: "ok", data: { title: "T", url: "https://target", content: "C", fromCache: false } },
    })),
    clearCache: vi.fn(),
    ...overrides,
  };
}

function parseText(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text);
}

describe("iflow_web_search tool", () => {
  it("rejects missing query", async () => {
    const tool = createWebSearchTool(mockClient());
    const out = parseText(await tool.execute("id", {}));
    expect(out.error).toBe("missing_param");
  });

  it("rejects empty query", async () => {
    const tool = createWebSearchTool(mockClient());
    const out = parseText(await tool.execute("id", { query: "   " }));
    expect(out.error).toBe("missing_param");
  });

  it("clamps count above max", async () => {
    const client = mockClient();
    const tool = createWebSearchTool(client);
    await tool.execute("id", { query: "q", count: 9999 });
    expect(client.webSearch).toHaveBeenCalledWith("q", WEB_SEARCH_MAX_COUNT);
  });

  it("uses default count when omitted", async () => {
    const client = mockClient();
    const tool = createWebSearchTool(client);
    await tool.execute("id", { query: "q" });
    expect(client.webSearch).toHaveBeenCalledWith("q", WEB_SEARCH_DEFAULT_COUNT);
  });

  it("returns normalized success payload", async () => {
    const tool = createWebSearchTool(mockClient());
    const out = parseText(await tool.execute("id", { query: "hi" }));
    expect(out.provider).toBe("iflow");
    expect(Array.isArray(out.results)).toBe(true);
    expect((out.results as unknown[])[0]).toMatchObject({ url: "https://x" });
  });

  it("passes through client errors", async () => {
    const client = mockClient({
      webSearch: vi.fn(async () => ({
        ok: false as const,
        tookMs: 0,
        error: { error: "missing_api_key" as const, message: "no key" },
      })),
    });
    const tool = createWebSearchTool(client);
    const out = parseText(await tool.execute("id", { query: "hi" }));
    expect(out.error).toBe("missing_api_key");
  });

  it("annotates cached responses", async () => {
    const client = mockClient({
      webSearch: vi.fn(async () => ({
        ok: true as const,
        fromCache: true,
        tookMs: 0,
        data: { success: true, code: "200", message: "ok", data: { query: "q", organic: [] } },
      })),
    });
    const tool = createWebSearchTool(client);
    const out = parseText(await tool.execute("id", { query: "q" }));
    expect(out.cached).toBe(true);
  });
});

describe("iflow_image_search tool", () => {
  it("returns normalized images list", async () => {
    const tool = createImageSearchTool(mockClient());
    const out = parseText(await tool.execute("id", { query: "猫" }));
    expect(out.provider).toBe("iflow");
    expect((out.images as unknown[])[0]).toEqual({ url: "https://i.jpg", title: "T", sourceUrl: "https://src" });
  });

  it("forwards count to client", async () => {
    const client = mockClient();
    const tool = createImageSearchTool(client);
    await tool.execute("id", { query: "猫", count: 7 });
    expect(client.imageSearch).toHaveBeenCalledWith("猫", 7);
  });
});

describe("iflow_web_fetch tool", () => {
  it("rejects missing url", async () => {
    const tool = createWebFetchTool(mockClient());
    const out = parseText(await tool.execute("id", {}));
    expect(out.error).toBe("missing_param");
  });

  it("rejects non-http urls", async () => {
    const tool = createWebFetchTool(mockClient());
    const out = parseText(await tool.execute("id", { url: "file:///etc/passwd" }));
    expect(out.error).toBe("invalid_param");
  });

  it("rejects malformed urls", async () => {
    const tool = createWebFetchTool(mockClient());
    const out = parseText(await tool.execute("id", { url: "not a url" }));
    expect(out.error).toBe("invalid_param");
  });

  it("returns normalized page content", async () => {
    const tool = createWebFetchTool(mockClient());
    const out = parseText(await tool.execute("id", { url: "https://target" }));
    expect(out).toMatchObject({
      provider: "iflow",
      url: "https://target",
      content: "C",
      title: "T",
    });
  });
});
