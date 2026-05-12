/**
 * Error taxonomy for the iFlow plugin.
 *
 * Every failure path returns one of these tagged shapes so that the tool
 * handler can render a consistent JSON payload back to the agent without
 * leaking the API key or sensitive headers.
 */

export const IFLOW_ERROR_DOCS_URL = "https://platform.iflow.cn/docs/";

export type IflowErrorCode =
  | "missing_api_key"
  | "missing_param"
  | "invalid_param"
  | "network_timeout"
  | "network_error"
  | "api_error"
  | "api_business_error";

export interface IflowError {
  error: IflowErrorCode;
  message: string;
  status?: number;
  code?: string | number;
  docs?: string;
}

export function missingApiKeyError(): IflowError {
  return {
    error: "missing_api_key",
    message:
      "iFlow Search needs an API key. Set IFLOW_API_KEY in the environment, or configure plugins.entries.iflow.config.webSearch.apiKey.",
    docs: IFLOW_ERROR_DOCS_URL,
  };
}

export function missingParamError(name: string): IflowError {
  return {
    error: "missing_param",
    message: `Parameter "${name}" is required.`,
  };
}

export function invalidParamError(name: string, detail: string): IflowError {
  return {
    error: "invalid_param",
    message: `Parameter "${name}" is invalid: ${detail}`,
  };
}

export function networkTimeoutError(timeoutMs: number): IflowError {
  return {
    error: "network_timeout",
    message: `Request to iFlow timed out after ${Math.round(timeoutMs)}ms.`,
  };
}

export function networkError(detail: string): IflowError {
  return {
    error: "network_error",
    message: `Network error talking to iFlow: ${detail}`,
  };
}

export function apiHttpError(status: number, message: string): IflowError {
  let hint = message || `HTTP ${status}`;
  if (status === 401) hint = "401 Unauthorized — the iFlow API key is missing or invalid.";
  else if (status === 403) hint = "403 Forbidden — the iFlow API key is not allowed for this endpoint.";
  else if (status === 429) hint = "429 Too Many Requests — iFlow rate limit reached. Slow down or retry later.";
  return { error: "api_error", status, message: hint, docs: IFLOW_ERROR_DOCS_URL };
}

export function apiBusinessError(opts: {
  code?: string | number | null;
  message?: string | null;
  errorMsg?: string | null;
  errorCode?: string | number | null;
}): IflowError {
  const parts: string[] = [];
  if (opts.message) parts.push(String(opts.message));
  if (opts.errorMsg && opts.errorMsg !== opts.message) parts.push(`detail: ${opts.errorMsg}`);
  const message = parts.join(" — ") || "iFlow API returned success=false without a message.";
  return {
    error: "api_business_error",
    code: opts.errorCode ?? opts.code ?? undefined,
    message,
    docs: IFLOW_ERROR_DOCS_URL,
  };
}

export function isIflowError(value: unknown): value is IflowError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IflowError).error === "string" &&
    typeof (value as IflowError).message === "string"
  );
}
