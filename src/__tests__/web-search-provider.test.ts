import { describe, expect, it, vi } from "vitest";
import { createIflowWebSearchProvider } from "../web-search-provider.ts";
import type { IflowClient } from "../client.ts";

function mockClient(overrides: Partial<IflowClient> = {}): IflowClient {
  return {
    webSearch: vi.fn(async (query: string) => ({
      ok: true as const,
      fromCache: false,
      tookMs: 5,
      data: {
        success: true,
        code: "200",
        message: "ok",
        data: {
          query,
          organic: [
            { title: "T", link: "https://x", snippet: "s", position: 1, date: null },
          ],
        },
      },
    })),
    imageSearch: vi.fn(),
    webFetch: vi.fn(),
    clearCache: vi.fn(),
    ...overrides,
  } as unknown as IflowClient;
}

function stubContractFields(): Record<string, unknown> {
  return {
    getCredentialValue: () => undefined,
    setCredentialValue: () => {},
    inactiveSecretPaths: [],
  };
}

describe("createIflowWebSearchProvider", () => {
  it("exposes the expected metadata + createTool", () => {
    const provider = createIflowWebSearchProvider({
      client: mockClient(),
      createContractFields: stubContractFields,
    });
    expect(provider.id).toBe("iflow");
    expect(provider.envVars).toEqual(["IFLOW_API_KEY"]);
    expect(provider.credentialPath).toBe(
      "plugins.entries.iflow.config.webSearch.apiKey",
    );
    expect(provider.autoDetectOrder).toBe(80);
    const tool = provider.createTool();
    expect(tool).not.toBeNull();
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.description).toBe("string");
  });

  it("createTool().execute returns normalized results for a valid query", async () => {
    const provider = createIflowWebSearchProvider({
      client: mockClient(),
      createContractFields: stubContractFields,
    });
    const tool = provider.createTool();
    const result = (await tool.execute({ query: "OpenClaw plugin", count: 3 })) as Record<
      string,
      unknown
    >;
    expect(result).toMatchObject({
      query: "OpenClaw plugin",
      provider: "iflow",
      count: 1,
    });
    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ title: "T", url: "https://x", snippet: "s" });
  });

  it("createTool().execute clamps count to [1, 10] and defaults to 10", async () => {
    const webSearch = vi.fn(async () => ({
      ok: true as const,
      fromCache: false,
      tookMs: 5,
      data: { success: true, code: "200", message: "ok", data: { query: "x", organic: [] } },
    }));
    const provider = createIflowWebSearchProvider({
      client: mockClient({ webSearch }),
      createContractFields: stubContractFields,
    });
    const tool = provider.createTool();
    await tool.execute({ query: "x", count: 999 });
    expect(webSearch).toHaveBeenLastCalledWith("x", 10);
    await tool.execute({ query: "x", count: 0 });
    expect(webSearch).toHaveBeenLastCalledWith("x", 10);
    await tool.execute({ query: "x", count: 5 });
    expect(webSearch).toHaveBeenLastCalledWith("x", 5);
    await tool.execute({ query: "x" });
    expect(webSearch).toHaveBeenLastCalledWith("x", 10);
  });

  it("createTool().execute returns missing_param on empty or non-string query", async () => {
    const provider = createIflowWebSearchProvider({
      client: mockClient(),
      createContractFields: stubContractFields,
    });
    const tool = provider.createTool();
    const r1 = (await tool.execute({})) as { error?: string };
    expect(r1.error).toBe("missing_param");
    const r2 = (await tool.execute({ query: "   " })) as { error?: string };
    expect(r2.error).toBe("missing_param");
    const r3 = (await tool.execute({ query: 42 })) as { error?: string };
    expect(r3.error).toBe("missing_param");
  });

  it("createTool().execute surfaces client error as the error payload", async () => {
    const failingClient = mockClient({
      webSearch: vi.fn(async () => ({
        ok: false as const,
        tookMs: 5,
        error: {
          error: "api_error" as const,
          status: 401,
          message: "401 Unauthorized",
        },
      })),
    });
    const provider = createIflowWebSearchProvider({
      client: failingClient,
      createContractFields: stubContractFields,
    });
    const tool = provider.createTool();
    const result = (await tool.execute({ query: "x" })) as {
      error?: string;
      status?: number;
    };
    expect(result.error).toBe("api_error");
    expect(result.status).toBe(401);
  });

  it("createTool().execute marks cached=true when client returns fromCache", async () => {
    const provider = createIflowWebSearchProvider({
      client: mockClient({
        webSearch: vi.fn(async () => ({
          ok: true as const,
          fromCache: true,
          tookMs: 0,
          data: {
            success: true,
            code: "200",
            message: "ok",
            data: { query: "x", organic: [] },
          },
        })),
      }),
      createContractFields: stubContractFields,
    });
    const tool = provider.createTool();
    const result = (await tool.execute({ query: "x" })) as Record<string, unknown>;
    expect(result.cached).toBe(true);
  });
});
