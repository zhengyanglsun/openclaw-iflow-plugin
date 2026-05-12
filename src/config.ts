/**
 * Config resolution for the iFlow plugin.
 *
 * The plugin reads `pluginConfig.webSearch.*` and falls back to env vars
 * for the API key. SecretRef objects (resolved by OpenClaw upstream) are
 * tolerated by accepting `string | { value: string } | unknown`.
 */

export const DEFAULT_BASE_URL = "https://platform.iflow.cn";
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const DEFAULT_CACHE_TTL_MINUTES = 15;
export const ENV_API_KEY = "IFLOW_API_KEY";

export interface IflowResolvedConfig {
  apiKey: string | undefined;
  baseUrl: string;
  timeoutMs: number;
  cacheTtlMs: number;
}

interface RawConfig {
  webSearch?: {
    apiKey?: unknown;
    baseUrl?: unknown;
    timeoutSeconds?: unknown;
    cacheTtlMinutes?: unknown;
  };
}

function readSecretString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value && typeof value === "object") {
    const v = (value as Record<string, unknown>).value;
    if (typeof v === "string") {
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return undefined;
}

function readEnv(name: string): string | undefined {
  const v = process.env?.[name];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveConfig(pluginConfig: Record<string, unknown> | undefined): IflowResolvedConfig {
  const cfg = (pluginConfig ?? {}) as RawConfig;
  const ws = cfg.webSearch ?? {};

  const apiKey = readSecretString(ws.apiKey) ?? readEnv(ENV_API_KEY);

  const rawBaseUrl = readSecretString(ws.baseUrl) ?? DEFAULT_BASE_URL;
  const baseUrl = rawBaseUrl.replace(/\/+$/u, "") || DEFAULT_BASE_URL;

  const timeoutSeconds = typeof ws.timeoutSeconds === "number" && Number.isFinite(ws.timeoutSeconds) && ws.timeoutSeconds > 0
    ? ws.timeoutSeconds
    : DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = Math.round(timeoutSeconds * 1000);

  const cacheTtlMinutes = typeof ws.cacheTtlMinutes === "number" && Number.isFinite(ws.cacheTtlMinutes) && ws.cacheTtlMinutes >= 0
    ? ws.cacheTtlMinutes
    : DEFAULT_CACHE_TTL_MINUTES;
  const cacheTtlMs = Math.round(cacheTtlMinutes * 60_000);

  return { apiKey, baseUrl, timeoutMs, cacheTtlMs };
}

export function redactApiKey(key: string | undefined): string {
  if (!key) return "<unset>";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}***${key.slice(-2)}`;
}
