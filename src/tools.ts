/**
 * The three explicit OpenClaw tools exposed by this plugin.
 *
 * Schemas use @sinclair/typebox, matching openclaw-tavily. Each tool returns
 * the OpenClaw-standard `{ content: [{ type: "text", text }], details: {} }`
 * shape, where `text` is a stringified JSON payload.
 *
 * Tool parameter names follow the Tavily/Brave canonical convention
 * (`query`, `count`, `url`) for agent-side consistency. The iFlow API's
 * actual body fields (`keywords`, `num`) are produced inside `client.ts`.
 */

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { IflowClient } from "./client.js";
import {
  invalidParamError,
  missingParamError,
  type IflowError,
} from "./errors.js";
import {
  normalizeImageSearch,
  normalizeWebFetch,
  normalizeWebSearch,
} from "./normalize.js";

// -- Schemas ----------------------------------------------------------------

export const WEB_SEARCH_DEFAULT_COUNT = 10;
export const WEB_SEARCH_MAX_COUNT = 10;
export const IMAGE_SEARCH_DEFAULT_COUNT = 10;
export const IMAGE_SEARCH_MAX_COUNT = 20;

export const IflowWebSearchSchema = Type.Object({
  query: Type.String({
    minLength: 1,
    description: "Search query. Forwarded to iFlow as 'keywords'.",
  }),
  count: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: WEB_SEARCH_MAX_COUNT,
      description: `Number of results (1-${WEB_SEARCH_MAX_COUNT}). Default: ${WEB_SEARCH_DEFAULT_COUNT}. Forwarded to iFlow as 'num'.`,
    }),
  ),
});

export const IflowImageSearchSchema = Type.Object({
  query: Type.String({
    minLength: 1,
    description: "Image search query. Forwarded to iFlow as 'keywords'.",
  }),
  count: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: IMAGE_SEARCH_MAX_COUNT,
      description: `Number of images (1-${IMAGE_SEARCH_MAX_COUNT}). Default: ${IMAGE_SEARCH_DEFAULT_COUNT}. Forwarded to iFlow as 'num'.`,
    }),
  ),
});

export const IflowWebFetchSchema = Type.Object({
  url: Type.String({
    minLength: 1,
    description: "HTTP(S) URL to fetch.",
  }),
});

type IflowWebSearchParams = Static<typeof IflowWebSearchSchema>;
type IflowImageSearchParams = Static<typeof IflowImageSearchSchema>;
type IflowWebFetchParams = Static<typeof IflowWebFetchSchema>;

// -- OpenClaw tool surface --------------------------------------------------

export interface OpenClawToolContent {
  type: "text";
  text: string;
}

export interface OpenClawToolResult {
  content: OpenClawToolContent[];
  details: Record<string, unknown>;
}

export interface OpenClawTool<S extends TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: S;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<OpenClawToolResult>;
}

function ok(payload: unknown): OpenClawToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: {},
  };
}

function fail(err: IflowError): OpenClawToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(err, null, 2) }],
    details: {},
  };
}

function readQuery(params: Record<string, unknown>): { query: string } | IflowError {
  const raw = params.query;
  if (typeof raw !== "string") return missingParamError("query");
  const query = raw.trim();
  if (query.length === 0) return missingParamError("query");
  return { query };
}

function readCount(
  params: Record<string, unknown>,
  defaultCount: number,
  maxCount: number,
): number {
  const raw = params.count;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return defaultCount;
  const intVal = Math.floor(raw);
  if (intVal < 1) return 1;
  if (intVal > maxCount) return maxCount;
  return intVal;
}

function readUrl(params: Record<string, unknown>): { url: string } | IflowError {
  const raw = params.url;
  if (typeof raw !== "string") return missingParamError("url");
  const url = raw.trim();
  if (url.length === 0) return missingParamError("url");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return invalidParamError("url", "must be an http:// or https:// URL");
    }
  } catch {
    return invalidParamError("url", "not a valid URL");
  }
  return { url };
}

// -- Tool factories ---------------------------------------------------------

export function createWebSearchTool(client: IflowClient): OpenClawTool<typeof IflowWebSearchSchema> {
  return {
    name: "iflow_web_search",
    label: "iFlow Web Search",
    description:
      "Search the public web via iFlow Search (心流搜索). Returns titles, URLs, snippets, position, and (when available) publish date. Chinese-language results are first-class.",
    parameters: IflowWebSearchSchema,
    async execute(_toolCallId, params) {
      const q = readQuery(params);
      if ("error" in q) return fail(q);
      const count = readCount(params, WEB_SEARCH_DEFAULT_COUNT, WEB_SEARCH_MAX_COUNT);
      const result = await client.webSearch(q.query, count);
      if (!result.ok) return fail(result.error);
      const normalized = normalizeWebSearch(result.data, q.query, result.tookMs);
      const payload: Record<string, unknown> = { ...normalized };
      if (result.fromCache) payload.cached = true;
      return ok(payload);
    },
  } satisfies OpenClawTool<typeof IflowWebSearchSchema> & { execute: (id: string, p: Record<string, unknown>) => Promise<OpenClawToolResult> };
}

export function createImageSearchTool(client: IflowClient): OpenClawTool<typeof IflowImageSearchSchema> {
  return {
    name: "iflow_image_search",
    label: "iFlow Image Search",
    description:
      "Search the public web for images via iFlow Search. Returns image URLs, titles, and source page URLs.",
    parameters: IflowImageSearchSchema,
    async execute(_toolCallId, params) {
      const q = readQuery(params);
      if ("error" in q) return fail(q);
      const count = readCount(params, IMAGE_SEARCH_DEFAULT_COUNT, IMAGE_SEARCH_MAX_COUNT);
      const result = await client.imageSearch(q.query, count);
      if (!result.ok) return fail(result.error);
      const normalized = normalizeImageSearch(result.data, q.query, result.tookMs);
      const payload: Record<string, unknown> = { ...normalized };
      if (result.fromCache) payload.cached = true;
      return ok(payload);
    },
  };
}

export function createWebFetchTool(client: IflowClient): OpenClawTool<typeof IflowWebFetchSchema> {
  return {
    name: "iflow_web_fetch",
    label: "iFlow Web Fetch",
    description:
      "Fetch the readable content of a single web page via iFlow Search. Returns title, plain-text/markdown content, and a cache hint.",
    parameters: IflowWebFetchSchema,
    async execute(_toolCallId, params) {
      const u = readUrl(params);
      if ("error" in u) return fail(u);
      const result = await client.webFetch(u.url);
      if (!result.ok) return fail(result.error);
      const normalized = normalizeWebFetch(result.data, u.url, result.tookMs);
      const payload: Record<string, unknown> = { ...normalized };
      if (result.fromCache) payload.cached = true;
      return ok(payload);
    },
  };
}

// Exported for test fixtures.
export const _internals = { readQuery, readCount, readUrl };

// Re-export types used by tests.
export type { IflowWebSearchParams, IflowImageSearchParams, IflowWebFetchParams };
