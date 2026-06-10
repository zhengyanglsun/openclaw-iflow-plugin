import { afterEach, describe, expect, it, vi } from "vitest";
import iflowPlugin from "../../index.ts";

describe("iflow plugin initialization logging", () => {
  const priorFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = priorFetch;
    vi.restoreAllMocks();
  });

  it("does not log API key values or derived key material", () => {
    const logs: string[] = [];
    const apiKey = "test-api-key-value";

    iflowPlugin.register({
      pluginConfig: {
        webSearch: {
          apiKey,
        },
      },
      logger: {
        info: (message: string) => logs.push(message),
        warn: (message: string) => logs.push(message),
        error: (message: string) => logs.push(message),
      },
      registerTool: vi.fn(),
      registerService: vi.fn(),
    });

    const joined = logs.join("\n");
    expect(joined).toContain("iFlow API key configured");
    expect(joined).not.toContain(apiKey);
    expect(joined).not.toContain(["api", "Key="].join(""));
    expect(joined).not.toContain("***");
    expect(joined).not.toContain("test");
    expect(joined).not.toContain("value");
  });

  it("registers tools with explicit names even when the API key is missing", () => {
    const registerTool = vi.fn();

    iflowPlugin.register({
      pluginConfig: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerTool,
      registerService: vi.fn(),
    });

    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(registerTool.mock.calls.map(([, opts]) => opts?.name)).toEqual([
      "iflow_web_search",
      "iflow_image_search",
      "iflow_web_fetch",
    ]);
    expect(registerTool.mock.calls.map(([tool]) => typeof tool)).toEqual([
      "function",
      "function",
      "function",
    ]);
  });

  it("late-binds explicit tools to the runtime config snapshot", async () => {
    const registerTool = vi.fn();
    const fetchImpl = vi.fn(async () =>
      Response.json({
        success: true,
        code: "200",
        message: "ok",
        data: { query: "openclaw", organic: [] },
      }),
    );
    globalThis.fetch = fetchImpl as typeof globalThis.fetch;

    iflowPlugin.register({
      config: {},
      pluginConfig: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerTool,
      registerService: vi.fn(),
    });

    const searchFactory = registerTool.mock.calls.find(
      ([, opts]) => opts?.name === "iflow_web_search",
    )?.[0];
    if (typeof searchFactory !== "function") {
      throw new Error("Expected iflow_web_search to register as a factory");
    }

    const tool = searchFactory({
      runtimeConfig: {
        plugins: {
          entries: {
            iflow: {
              config: {
                webSearch: {
                  apiKey: "runtime-test-api-key",
                },
              },
            },
          },
        },
      },
    });
    await tool.execute("call-id", { query: "openclaw" });

    const init = (fetchImpl.mock.calls as unknown as Array<[unknown, RequestInit]>)[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer runtime-test-api-key",
    );
  });
});
