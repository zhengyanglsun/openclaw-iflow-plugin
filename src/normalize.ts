/**
 * Map raw iFlow API responses to the plugin's normalized output.
 *
 * Field mapping is based on real responses captured on 2026-05-12. If iFlow
 * changes their schema, only this file (and its test) should need to move.
 *
 * --- FIELDS TO REVISIT IF IFLOW API CHANGES ---
 * webSearch:
 *   - data.organic[].link   ← iFlow uses "link", we expose it as "url"
 *   - data.organic[].position  ← may be null on later results
 *   - data.organic[].date      ← string or null (Chinese formatting observed: "2023年12月4日")
 * imageSearch:
 *   - data is a flat array (NOT data.images)
 *   - data[].refUrl         ← exposed as "sourceUrl"
 * webFetch:
 *   - data.fromCache may be absent on first call (we treat undefined as null)
 *   - data.content is a single string; large pages may exceed token budgets
 * Error envelope (all endpoints):
 *   - { success, code, message, exception, data: { errorMsg, errorCode } }
 */

export interface IflowEnvelope<T> {
  success?: boolean;
  code?: string | number;
  message?: string;
  exception?: unknown;
  data?: T;
  extra?: unknown;
}

export interface RawOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number | null;
  date?: string | null;
}

export interface RawWebSearchData {
  organic?: RawOrganicItem[] | null;
  query?: string;
  errorMsg?: string | null;
  errorCode?: string | number | null;
}

export interface RawImageItem {
  url?: string;
  title?: string | null;
  refUrl?: string | null;
}

export type RawImageSearchData = RawImageItem[];

export interface RawWebFetchData {
  title?: string | null;
  content?: string;
  url?: string;
  fromCache?: boolean;
  errorMsg?: string | null;
  errorCode?: string | number | null;
}

export interface NormalizedWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number | null;
  date: string | null;
}

export interface NormalizedWebSearch {
  query: string;
  provider: "iflow";
  count: number;
  tookMs: number;
  results: NormalizedWebSearchResult[];
}

export interface NormalizedImage {
  url: string;
  title: string | null;
  sourceUrl: string | null;
}

export interface NormalizedImageSearch {
  query: string;
  provider: "iflow";
  count: number;
  tookMs: number;
  images: NormalizedImage[];
}

export interface NormalizedWebFetch {
  title: string | null;
  url: string;
  content: string;
  fromCache: boolean | null;
  provider: "iflow";
  tookMs: number;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function normalizeWebSearch(
  raw: IflowEnvelope<RawWebSearchData> | null | undefined,
  requestQuery: string,
  tookMs: number,
): NormalizedWebSearch {
  const data = raw?.data;
  const organic = Array.isArray(data?.organic) ? data!.organic! : [];
  const results: NormalizedWebSearchResult[] = organic
    .filter((r): r is RawOrganicItem => r !== null && typeof r === "object")
    .map((r) => ({
      title: asString(r.title),
      url: asString(r.link),
      snippet: asString(r.snippet),
      position: asNullableNumber(r.position),
      date: asNullableString(r.date),
    }));
  return {
    query: asString(data?.query, requestQuery),
    provider: "iflow",
    count: results.length,
    tookMs,
    results,
  };
}

export function normalizeImageSearch(
  raw: IflowEnvelope<RawImageSearchData> | null | undefined,
  requestQuery: string,
  tookMs: number,
): NormalizedImageSearch {
  const data = raw?.data;
  const arr = Array.isArray(data) ? data : [];
  const images: NormalizedImage[] = arr
    .filter((r): r is RawImageItem => r !== null && typeof r === "object")
    .map((r) => ({
      url: asString(r.url),
      title: asNullableString(r.title),
      sourceUrl: asNullableString(r.refUrl),
    }))
    .filter((img) => img.url.length > 0);
  return {
    query: requestQuery,
    provider: "iflow",
    count: images.length,
    tookMs,
    images,
  };
}

export function normalizeWebFetch(
  raw: IflowEnvelope<RawWebFetchData> | null | undefined,
  requestUrl: string,
  tookMs: number,
): NormalizedWebFetch {
  const data = raw?.data;
  const fromCache =
    typeof data?.fromCache === "boolean" ? data!.fromCache : null;
  return {
    title: asNullableString(data?.title),
    url: asString(data?.url, requestUrl),
    content: asString(data?.content),
    fromCache,
    provider: "iflow",
    tookMs,
  };
}
