/**
 * @iflow-ai/iflow-plugin — iFlow Search plugin for OpenClaw.
 *
 * Capability tiers:
 *   - Tools mode (stable):  iflow_web_search, iflow_image_search, iflow_web_fetch
 *                           registered via api.registerTool.
 *   - Provider mode (best-effort): iflow registered as a web_search provider
 *                           via api.registerWebSearchProvider, only when the
 *                           running OpenClaw runtime exposes that API AND the
 *                           openclaw/plugin-sdk/provider-web-search-config-contract
 *                           subpath is importable.
 *
 * Both modes share the same HTTP client and normalize layer.
 */

import { resolveConfig, redactApiKey } from "./src/config.js";
import { createIflowClient, type IflowClient } from "./src/client.js";
import {
  createImageSearchTool,
  createWebFetchTool,
  createWebSearchTool,
} from "./src/tools.js";
import { createIflowWebSearchProvider } from "./src/web-search-provider.js";

// Minimal local mirror of the OpenClaw PluginApi surface we touch. We do NOT
// import from "openclaw/plugin-sdk" here so the plugin can be type-checked
// without OpenClaw installed (matches openclaw-tavily's approach).
interface PluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  registerTool: (tool: unknown, opts?: { source?: string }) => void;
  registerService: (svc: { id: string; start: () => void; stop: () => void }) => void;
  /** Best-effort. Not present on every runtime. */
  registerWebSearchProvider?: (provider: unknown) => void;
}

const PLUGIN_ID = "iflow";

const iflowPlugin = {
  id: PLUGIN_ID,
  name: "iFlow Search",
  description:
    "iFlow Search (心流搜索) — web search, image search, and web content fetch tools for OpenClaw agents.",
  kind: "tools" as const,

  register(api: PluginApi): void {
    const cfg = resolveConfig(api.pluginConfig);

    if (!cfg.apiKey) {
      api.logger.warn(
        "iflow: no API key found. Set IFLOW_API_KEY or plugins.entries.iflow.config.webSearch.apiKey. Plugin idle.",
      );
      api.registerService({
        id: PLUGIN_ID,
        start: () => api.logger.info("iflow: idle (no API key)"),
        stop: () => {},
      });
      return;
    }

    const client = createIflowClient({ config: cfg, logger: api.logger });

    api.logger.info(
      `iflow: initialized (baseUrl=${cfg.baseUrl}, timeout=${Math.round(
        cfg.timeoutMs / 1000,
      )}s, cacheTtl=${Math.round(cfg.cacheTtlMs / 60_000)}min, apiKey=${redactApiKey(cfg.apiKey)})`,
    );

    // Tier 1 — tools mode (stable baseline)
    registerTools(api, client);

    // Tier 2 — provider mode (best-effort)
    void tryRegisterProvider(api, client).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.info(`iflow: provider mode unavailable, staying in tools-only mode (${msg})`);
    });

    api.registerService({
      id: PLUGIN_ID,
      start: () => api.logger.info("iflow: service started"),
      stop: () => {
        client.clearCache();
        api.logger.info("iflow: service stopped, cache cleared");
      },
    });
  },
};

function registerTools(api: PluginApi, client: IflowClient): void {
  api.registerTool(createWebSearchTool(client), { source: PLUGIN_ID });
  api.registerTool(createImageSearchTool(client), { source: PLUGIN_ID });
  api.registerTool(createWebFetchTool(client), { source: PLUGIN_ID });
}

async function tryRegisterProvider(api: PluginApi, client: IflowClient): Promise<void> {
  if (typeof api.registerWebSearchProvider !== "function") {
    throw new Error("registerWebSearchProvider not exposed by this OpenClaw runtime");
  }

  // Dynamic import: a missing subpath becomes a caught promise rejection,
  // not a module-load error for this plugin.
  const sdk = (await import(
    /* @vite-ignore */ "openclaw/plugin-sdk/provider-web-search-config-contract" as string
  ).catch((err: unknown) => {
    throw new Error(
      `openclaw/plugin-sdk/provider-web-search-config-contract not importable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  })) as { createWebSearchProviderContractFields?: unknown };

  const factory = sdk.createWebSearchProviderContractFields;
  if (typeof factory !== "function") {
    throw new Error("createWebSearchProviderContractFields not exported by the SDK subpath");
  }

  const provider = createIflowWebSearchProvider({
    client,
    createContractFields: factory as Parameters<typeof createIflowWebSearchProvider>[0]["createContractFields"],
  });
  api.registerWebSearchProvider(provider);
  api.logger.info("iflow: registered as web_search provider (best-effort)");
}

export default iflowPlugin;
