import { describe, expect, it, vi, type Mock } from "vitest";
import { createIflowClient, type ClientLogger } from "../client.ts";
import type { IflowResolvedConfig } from "../config.ts";

function makeConfig(overrides: Partial<IflowResolvedConfig> = {}): IflowResolvedConfig {
  return {
    apiKey: "sk-test",
    baseUrl: "https://platform.example",
    timeoutMs: 5_000,
    cacheTtlMs: 0,
    ...overrides,
  };
}

interface TestLogger extends ClientLogger {
  info: Mock;
  warn: Mock;
  error: Mock;
}

function makeLogger(): TestLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

type FetchMock = Mock & ((input: string | URL, init?: RequestInit) => Promise<Response>);

function fetchMock(impl: (url: string, init?: RequestInit) => Promise<Response>): FetchMock {
  return vi.fn(impl) as unknown as FetchMock;
}

function lastCall(fetchImpl: FetchMock): [string, RequestInit] {
  const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
  const last = calls[calls.length - 1];
  if (!last) throw new Error("fetch was not called");
  return last;
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("createIflowClient", () => {
  it("sends Bearer auth and POST JSON for webSearch", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({ success: true, code: "200", message: "ok", data: { organic: [], query: "x" } }),
    );
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });

    const res = await client.webSearch("hello", 3);

    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall(fetchImpl);
    expect(url).toBe("https://platform.example/api/search/webSearch");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ keywords: "hello", num: 3 });
  });

  it("returns missing_api_key without calling fetch when key is absent", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({}));
    const client = createIflowClient({
      config: makeConfig({ apiKey: undefined }),
      logger: makeLogger(),
      fetchImpl,
    });
    const res = await client.webSearch("hi", 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.error).toBe("missing_api_key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])("maps HTTP %i to api_error", async (status) => {
    const fetchImpl = fetchMock(async () => new Response("nope", { status }));
    const logger = makeLogger();
    const client = createIflowClient({ config: makeConfig(), logger, fetchImpl });

    const res = await client.webSearch("q", 1);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.error).toBe("api_error");
      expect(res.error.status).toBe(status);
    }
    expect(logger.warn).toHaveBeenCalled();
  });

  it("never leaks API key into logger or error messages on 401", async () => {
    const fetchImpl = fetchMock(async () => new Response("Unauthorized", { status: 401 }));
    const logger = makeLogger();
    const client = createIflowClient({
      config: makeConfig({ apiKey: "sk-SUPER-SECRET-VALUE" }),
      logger,
      fetchImpl,
    });
    const res = await client.webSearch("q", 1);
    const allLogs = [
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls,
    ]
      .flat()
      .join("\n");
    expect(allLogs).not.toContain("sk-SUPER-SECRET-VALUE");
    if (!res.ok) expect(JSON.stringify(res.error)).not.toContain("sk-SUPER-SECRET-VALUE");
  });

  it("returns network_timeout when fetch aborts", async () => {
    const fetchImpl = fetchMock(async (_url, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const client = createIflowClient({
      config: makeConfig({ timeoutMs: 5 }),
      logger: makeLogger(),
      fetchImpl,
    });
    const res = await client.webSearch("q", 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.error).toBe("network_timeout");
  });

  it("returns network_error when fetch rejects", async () => {
    const fetchImpl = fetchMock(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });
    const res = await client.webSearch("q", 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.error).toBe("network_error");
  });

  it("maps success:false to api_business_error and includes errorMsg", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({
        success: false,
        code: "4001",
        message: "限流",
        data: { errorMsg: "rate limited", errorCode: "RATE_LIMITED" },
      }),
    );
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });
    const res = await client.webSearch("q", 1);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.error).toBe("api_business_error");
      expect(res.error.message).toContain("限流");
      expect(res.error.message).toContain("rate limited");
      expect(res.error.code).toBe("RATE_LIMITED");
    }
  });

  it("returns api_error for non-JSON 200", async () => {
    const fetchImpl = fetchMock(async () =>
      new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });
    const res = await client.webSearch("q", 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.error).toBe("api_error");
  });

  it("imageSearch sends the right path and body shape", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({ success: true, code: "200", message: "ok", data: [] }),
    );
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });
    const res = await client.imageSearch("猫", 5);
    expect(res.ok).toBe(true);
    const [url, init] = lastCall(fetchImpl);
    expect(url).toBe("https://platform.example/api/search/imageSearch");
    expect(JSON.parse(init.body as string)).toEqual({ keywords: "猫", num: 5 });
  });

  it("webFetch sends the right path and body shape", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({
        success: true,
        code: "200",
        message: "ok",
        data: { title: "T", url: "u", content: "C", fromCache: false },
      }),
    );
    const client = createIflowClient({ config: makeConfig(), logger: makeLogger(), fetchImpl });
    const res = await client.webFetch("https://target");
    expect(res.ok).toBe(true);
    const [url, init] = lastCall(fetchImpl);
    expect(url).toBe("https://platform.example/api/search/webFetch");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://target" });
  });

  it("caches successful responses within TTL", async () => {
    let counter = 0;
    const fetchImpl = fetchMock(async () => {
      counter += 1;
      return jsonResponse({ success: true, code: "200", message: "ok", data: { organic: [], query: "q" } });
    });
    const client = createIflowClient({
      config: makeConfig({ cacheTtlMs: 60_000 }),
      logger: makeLogger(),
      fetchImpl,
    });
    await client.webSearch("hello", 3);
    const second = await client.webSearch("hello", 3);
    expect(counter).toBe(1);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.fromCache).toBe(true);
  });

  it("does NOT cache failures", async () => {
    let counter = 0;
    const fetchImpl = fetchMock(async () => {
      counter += 1;
      return new Response("err", { status: 500 });
    });
    const client = createIflowClient({
      config: makeConfig({ cacheTtlMs: 60_000 }),
      logger: makeLogger(),
      fetchImpl,
    });
    await client.webSearch("hello", 3);
    await client.webSearch("hello", 3);
    expect(counter).toBe(2);
  });
});
