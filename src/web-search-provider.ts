/**
 * Best-effort `web_search` provider for OpenClaw's managed search router.
 *
 * The shape of the returned object mirrors @openclaw/brave-plugin's
 * `createBraveWebSearchProvider()` exactly, with iFlow-specific values
 * substituted. This is a REFERENCE alignment — we make no guarantee that the
 * third-party plugin contract is stable. The plugin entry wraps the use of
 * `registerWebSearchProvider` and this factory in try/catch so any signature
 * drift downgrades to tools-only mode without breaking plugin load.
 */

import type { IflowClient } from "./client.ts";
import { normalizeWebSearch } from "./normalize.ts";

const CREDENTIAL_PATH = "plugins.entries.iflow.config.webSearch.apiKey";

export interface CreateProviderOpts {
  client: IflowClient;
  /** Imported dynamically from openclaw/plugin-sdk/provider-web-search-config-contract. */
  createContractFields: (opts: {
    credentialPath: string;
    searchCredential: { type: "top-level" };
    configuredCredential: { pluginId: string };
  }) => Record<string, unknown>;
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
  createTool: () => unknown;
  runManagedWebSearch: (params: { query: string; count?: number }) => Promise<unknown>;
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
    createTool: () => null,
    /**
     * If the host runtime invokes this entry point instead of routing through
     * createTool() (newer SDKs are observed to do both), perform the search
     * and return a normalized payload. This is a forward-compatibility hook —
     * if the runtime doesn't call it, no harm done.
     */
    async runManagedWebSearch(params) {
      const query = String(params.query ?? "").trim();
      const count = typeof params.count === "number" && Number.isFinite(params.count) && params.count > 0
        ? Math.min(10, Math.max(1, Math.floor(params.count)))
        : 10;
      if (!query) return { error: "missing_param", message: 'Parameter "query" is required.' };
      const result = await client.webSearch(query, count);
      if (!result.ok) return result.error;
      return normalizeWebSearch(result.data, query, result.tookMs);
    },
  };
}
