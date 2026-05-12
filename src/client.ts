/**
 * HTTP client for the iFlow Search API.
 *
 * Responsibilities:
 *   - Build Bearer-authenticated POST requests
 *   - Enforce per-request timeout via AbortController
 *   - Classify failures into the IflowError taxonomy
 *   - Maintain a small in-memory cache (15-minute default) keyed by call params
 *   - Never log or echo the API key
 */

import {
  apiBusinessError,
  apiHttpError,
  isIflowError,
  networkError,
  networkTimeoutError,
  type IflowError,
} from "./errors.js";
import type { IflowResolvedConfig } from "./config.js";
import type {
  IflowEnvelope,
  RawImageSearchData,
  RawWebFetchData,
  RawWebSearchData,
} from "./normalize.js";

export interface ClientLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface IflowClient {
  webSearch(query: string, num: number, signal?: AbortSignal): Promise<ClientResult<IflowEnvelope<RawWebSearchData>>>;
  imageSearch(query: string, num: number, signal?: AbortSignal): Promise<ClientResult<IflowEnvelope<RawImageSearchData>>>;
  webFetch(url: string, signal?: AbortSignal): Promise<ClientResult<IflowEnvelope<RawWebFetchData>>>;
  clearCache(): void;
}

export interface ClientSuccess<T> {
  ok: true;
  data: T;
  tookMs: number;
  fromCache: boolean;
}

export interface ClientFailure {
  ok: false;
  error: IflowError;
  tookMs: number;
}

export type ClientResult<T> = ClientSuccess<T> | ClientFailure;

type FetchLike = typeof fetch;

export interface CreateClientOpts {
  config: IflowResolvedConfig;
  logger: ClientLogger;
  /** Override for tests. */
  fetchImpl?: FetchLike;
  /** Override for tests. */
  now?: () => number;
}

const MAX_CACHE_ENTRIES = 100;

const ENDPOINTS = {
  webSearch: "/api/search/webSearch",
  imageSearch: "/api/search/imageSearch",
  webFetch: "/api/search/webFetch",
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export function createIflowClient(opts: CreateClientOpts): IflowClient {
  const { config, logger } = opts;
  const fetchImpl: FetchLike = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const now = opts.now ?? Date.now;

  if (typeof fetchImpl !== "function") {
    throw new Error("createIflowClient: global fetch is not available; pass fetchImpl explicitly.");
  }

  const cache = new Map<string, CacheEntry>();

  function readCache<T>(key: string): T | null {
    if (config.cacheTtlMs <= 0) return null;
    const entry = cache.get(key);
    if (!entry) return null;
    if (now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    // Refresh LRU position
    cache.delete(key);
    cache.set(key, entry);
    return entry.value as T;
  }

  function writeCache(key: string, value: unknown): void {
    if (config.cacheTtlMs <= 0) return;
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { value, expiresAt: now() + config.cacheTtlMs });
  }

  async function call<T>(
    endpoint: EndpointKey,
    body: Record<string, unknown>,
    cacheKey: string,
    externalSignal?: AbortSignal,
  ): Promise<ClientResult<T>> {
    const start = now();

    const cached = readCache<T>(cacheKey);
    if (cached) {
      return { ok: true, data: cached, tookMs: 0, fromCache: true };
    }

    const url = `${config.baseUrl}${ENDPOINTS[endpoint]}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey ?? ""}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const tookMs = now() - start;
      const e = err as Error;
      if (e.name === "AbortError") {
        logger.warn(`iflow ${endpoint}: timeout after ${tookMs}ms`);
        return { ok: false, error: networkTimeoutError(config.timeoutMs), tookMs };
      }
      logger.warn(`iflow ${endpoint}: network error: ${e.message ?? String(err)}`);
      return { ok: false, error: networkError(e.message ?? String(err)), tookMs };
    } finally {
      clearTimeout(timer);
    }

    const tookMs = now() - start;

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 500);
      } catch {
        // ignore
      }
      logger.warn(`iflow ${endpoint}: HTTP ${response.status} (${tookMs}ms)`);
      return {
        ok: false,
        error: apiHttpError(response.status, detail || response.statusText),
        tookMs,
      };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (err) {
      const e = err as Error;
      logger.warn(`iflow ${endpoint}: invalid JSON response: ${e.message ?? String(err)}`);
      return {
        ok: false,
        error: { error: "api_error", status: response.status, message: "iFlow returned non-JSON response." },
        tookMs,
      };
    }

    const envelope = parsed as IflowEnvelope<unknown>;
    if (envelope?.success !== true) {
      const dataObj =
        envelope?.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
          ? (envelope.data as { errorMsg?: string | null; errorCode?: string | number | null })
          : undefined;
      logger.warn(
        `iflow ${endpoint}: api business error code=${String(envelope?.code)} message=${String(envelope?.message)}`,
      );
      return {
        ok: false,
        error: apiBusinessError({
          code: envelope?.code ?? null,
          message: envelope?.message ?? null,
          errorMsg: dataObj?.errorMsg ?? null,
          errorCode: dataObj?.errorCode ?? null,
        }),
        tookMs,
      };
    }

    writeCache(cacheKey, parsed);
    return { ok: true, data: parsed as T, tookMs, fromCache: false };
  }

  function ensureKey(): ClientFailure | null {
    if (!config.apiKey) {
      return {
        ok: false,
        error: {
          error: "missing_api_key",
          message:
            "iFlow Search needs an API key. Set IFLOW_API_KEY in the environment, or configure plugins.entries.iflow.config.webSearch.apiKey.",
        },
        tookMs: 0,
      };
    }
    return null;
  }

  return {
    async webSearch(query, num, signal) {
      const missing = ensureKey();
      if (missing) return missing as ClientFailure;
      const key = `webSearch:${num}:${query.toLowerCase()}`;
      return call<IflowEnvelope<RawWebSearchData>>("webSearch", { keywords: query, num }, key, signal);
    },
    async imageSearch(query, num, signal) {
      const missing = ensureKey();
      if (missing) return missing as ClientFailure;
      const key = `imageSearch:${num}:${query.toLowerCase()}`;
      return call<IflowEnvelope<RawImageSearchData>>("imageSearch", { keywords: query, num }, key, signal);
    },
    async webFetch(url, signal) {
      const missing = ensureKey();
      if (missing) return missing as ClientFailure;
      const key = `webFetch:${url.toLowerCase()}`;
      return call<IflowEnvelope<RawWebFetchData>>("webFetch", { url }, key, signal);
    },
    clearCache() {
      cache.clear();
    },
  };
}

export { isIflowError };
