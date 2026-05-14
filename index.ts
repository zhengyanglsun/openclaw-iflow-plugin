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
 *
 * Note on registration timing:
 *   OpenClaw's plugin loader signature is `register(api) => void` (sync, not
 *   awaited). The loader finalizes the plugin registry immediately after
 *   `register` returns. Any provider registration triggered from an async
 *   promise spawned by `register` will be flushed AFTER the registry is
 *   sealed and therefore will NOT be visible to web_search runtime
 *   resolution. So the SDK subpath import is resolved here at module init via
 *   a synchronous `createRequire` call and the resulting factory is cached in
 *   `providerSdkFactory`. `register` then performs the provider registration
 *   synchronously.
 */

import { createRequire } from "node:module";

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

type ProviderSdkFactory = Parameters<typeof createIflowWebSearchProvider>[0]["createContractFields"];

/**
 * Resolved at module init (before any `register(api)` call). Holds the
 * SDK-supplied contract-fields factory if importable, otherwise null.
 * `null` keeps the plugin in tools-only mode for that runtime (best-effort).
 *
 * We use `createRequire` (synchronous) rather than `await import(...)` because
 * OpenClaw's plugin loader (jiti) loads plugin entries synchronously and does
 * not support modules with top-level await. Node 22.x supports `require(esm)`
 * for ESM modules without top-level await, which the OpenClaw SDK subpath
 * satisfies.
 */
const providerSdkFactory: ProviderSdkFactory | null = resolveProviderSdkFactory();

function resolveProviderSdkFactory(): ProviderSdkFactory | null {
  try {
    const requireSdk = createRequire(import.meta.url);
    const sdk = requireSdk("openclaw/plugin-sdk/provider-web-search-config-contract") as {
      createWebSearchProviderContractFields?: unknown;
    };
    const factory = sdk.createWebSearchProviderContractFields;
    return typeof factory === "function" ? (factory as ProviderSdkFactory) : null;
  } catch {
    return null;
  }
}

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

    // Tier 2 — provider mode (best-effort, synchronous)
    registerProviderSync(api, client);

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

function registerProviderSync(api: PluginApi, client: IflowClient): void {
  if (typeof api.registerWebSearchProvider !== "function") {
    api.logger.info(
      "iflow: provider mode unavailable, staying in tools-only mode (registerWebSearchProvider not exposed by this OpenClaw runtime)",
    );
    return;
  }
  if (!providerSdkFactory) {
    api.logger.info(
      "iflow: provider mode unavailable, staying in tools-only mode (openclaw/plugin-sdk/provider-web-search-config-contract not importable)",
    );
    return;
  }
  const provider = createIflowWebSearchProvider({
    client,
    createContractFields: providerSdkFactory,
  });
  api.registerWebSearchProvider(provider);
  api.logger.info("iflow: registered as web_search provider (best-effort)");
}

export default iflowPlugin;
