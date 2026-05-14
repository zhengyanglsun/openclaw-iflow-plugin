/**
 * `web_search` provider implementation for OpenClaw's managed search router.
 *
 * `createTool` returns a real tool definition whose `execute` calls the iFlow
 * client. This mirrors the shape OpenClaw consumes in
 * `src/web-search/runtime.ts` (it calls `provider.createTool({...})` then
 * `definition.execute(args)`).
 *
 * `createContractFields` (imported dynamically at runtime from
 * openclaw/plugin-sdk/provider-web-search-config-contract) supplies
 * credential read/write helpers (`getCredentialValue`,
 * `setCredentialValue`, etc). It does NOT supply `createTool`, so this
 * file is responsible for the executable wiring.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { IflowClient } from "./client.js";
import { normalizeWebSearch } from "./normalize.js";

const CREDENTIAL_PATH = "plugins.entries.iflow.config.webSearch.apiKey";

const PROVIDER_DEFAULT_COUNT = 10;
const PROVIDER_MAX_COUNT = 10;

export const IflowProviderSearchSchema = Type.Object({
  query: Type.String({
    minLength: 1,
    description: "Search query. Forwarded to iFlow as 'keywords'.",
  }),
  count: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: PROVIDER_MAX_COUNT,
      description: `Number of results (1-${PROVIDER_MAX_COUNT}). Default ${PROVIDER_DEFAULT_COUNT}. Forwarded to iFlow as 'num'.`,
    }),
  ),
});

export type IflowProviderSearchParams = Static<typeof IflowProviderSearchSchema>;

export interface CreateProviderOpts {
  client: IflowClient;
  /** Imported dynamically from openclaw/plugin-sdk/provider-web-search-config-contract. */
  createContractFields: (opts: {
    credentialPath: string;
    searchCredential: { type: "top-level" };
    configuredCredential: { pluginId: string };
  }) => Record<string, unknown>;
}

export interface IflowProviderToolDefinition {
  description: string;
  parameters: typeof IflowProviderSearchSchema;
  execute: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | { error: string; message?: string }>;
}

export interface IflowWebSearchProvider extends Record<string, unknown> {
  id: "iflow";
  label: string;
  hint: string;
  onboardingScopes: string[];
  credentialLabel: string;
  envVars: string[];
  placeholder: string;
  signupUrl: string;
  docsUrl: string;
  autoDetectOrder: number;
  credentialPath: string;
  createTool: () => IflowProviderToolDefinition;
}

export function createIflowWebSearchProvider(opts: CreateProviderOpts): IflowWebSearchProvider {
  const { client, createContractFields } = opts;

  const contractFields = createContractFields({
    credentialPath: CREDENTIAL_PATH,
    searchCredential: { type: "top-level" },
    configuredCredential: { pluginId: "iflow" },
  });

  return {
    ...contractFields,
    id: "iflow",
    label: "iFlow Search",
    hint: "Chinese-language web search · structured snippets",
    onboardingScopes: ["text-inference"],
    credentialLabel: "iFlow API key",
    envVars: ["IFLOW_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://platform.iflow.cn",
    docsUrl: "https://platform.iflow.cn/docs/",
    autoDetectOrder: 80,
    credentialPath: CREDENTIAL_PATH,
    createTool: () => ({
      description:
        "Search the public web via iFlow Search (心流搜索). Returns titles, URLs, snippets, position, and (when available) publish date. Chinese-language results are first-class.",
      parameters: IflowProviderSearchSchema,
      execute: async (args) => {
        const rawQuery = args.query;
        if (typeof rawQuery !== "string") {
          return { error: "missing_param", message: 'Parameter "query" is required.' };
        }
        const query = rawQuery.trim();
        if (query.length === 0) {
          return { error: "missing_param", message: 'Parameter "query" is required.' };
        }
        const rawCount = args.count;
        const count =
          typeof rawCount === "number" && Number.isFinite(rawCount) && rawCount >= 1
            ? Math.min(PROVIDER_MAX_COUNT, Math.max(1, Math.floor(rawCount)))
            : PROVIDER_DEFAULT_COUNT;
        const result = await client.webSearch(query, count);
        if (!result.ok) {
          return result.error as unknown as { error: string; message?: string };
        }
        const normalized = normalizeWebSearch(result.data, query, result.tookMs);
        if (result.fromCache) {
          return { ...normalized, cached: true };
        }
        return normalized as unknown as Record<string, unknown>;
      },
    }),
  };
}
