import { describe, expect, it, vi } from "vitest";
import iflowPlugin from "../../index.ts";

describe("iflow plugin initialization logging", () => {
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
    expect(joined).not.toContain("apiKey=");
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
    expect(registerTool.mock.calls.map(([tool]) => tool?.name)).toEqual([
      "iflow_web_search",
      "iflow_image_search",
      "iflow_web_fetch",
    ]);
  });

});
