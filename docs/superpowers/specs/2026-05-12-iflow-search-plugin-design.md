# iFlow Search Plugin for OpenClaw — Design

**Date:** 2026-05-12
**Package name:** `@iflow-ai/iflow-plugin`
**Plugin id:** `iflow`
**Capability tiers:**
- **Tools mode (stable base):** registers `iflow_web_search`, `iflow_image_search`, `iflow_web_fetch` via `api.registerTool`. This is the supported, always-on path.
- **Provider mode (best-effort):** if and only if the running OpenClaw exposes `api.registerWebSearchProvider`, the plugin also registers itself as the `web_search` provider `iflow`. No version guarantee is made; we feature-detect at runtime, log either outcome, and continue.

`@openclaw/brave-plugin@2026.5.7` is consulted as a reference implementation of the provider contract, **not** as evidence that the same API is publicly available to third-party plugins.

---

## 1. Purpose

Expose iFlow Search (`platform.iflow.cn`) to OpenClaw agents as:

1. A `web_search` provider (so users can set `tools.web.search.provider: "iflow"`).
2. Three explicit tools the agent can call directly:
   - `iflow_web_search`
   - `iflow_image_search`
   - `iflow_web_fetch`

Parity target: same UX bar as bundled Brave plugin and community `openclaw-tavily`.

---

## 2. OpenClaw API alignment (verified against real artifacts)

All identifiers below were read from npm tarballs and live docs, not invented.

**Source confidence:**
- `registerTool`, `registerService`, `pluginConfig`, `logger`, manifest field names: **high** — community plugin `openclaw-tavily@0.2.1` (third-party) ships with these and runs on stock OpenClaw.
- `definePluginEntry`, `registerWebSearchProvider`, `createWebSearchProviderContractFields`: **observed only in bundled plugins** (`@openclaw/brave-plugin@2026.5.7`). The SDK exports them publicly, but we have no third-party precedent. Treated as best-effort at runtime, never as a hard requirement.

### 2.1 Plugin entry

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "iflow",
  name: "iFlow Search",
  description: "...",
  register(api) {
    // see §2.3
  },
});
```

Source: `@openclaw/brave-plugin@2026.5.7/dist/index.js` literally imports
`definePluginEntry` from `openclaw/plugin-sdk/plugin-entry`.

Fallback for older OpenClaw: `export default { id, name, description, register }` is
also accepted (this is what `openclaw-tavily@0.2.1/index.ts` does).

### 2.2 PluginApi surface used

| API | Source |
|---|---|
| `api.pluginConfig: Record<string, unknown>` | openclaw-tavily/index.ts |
| `api.logger.{info,warn,error}(msg: string)` | openclaw-tavily/index.ts |
| `api.registerTool(tool, opts?: { source })` | openclaw-tavily/index.ts |
| `api.registerService({ id, start, stop })` | openclaw-tavily/index.ts |
| `api.registerWebSearchProvider(provider)` | brave dist/index.js — **reference only, best-effort at runtime** |

`registerWebSearchProvider` is **feature-detected at runtime** — see §3.1. If the SDK import `openclaw/plugin-sdk/plugin-entry` or `openclaw/plugin-sdk/provider-web-search-config-contract` is unavailable, we skip provider mode without failing the plugin load.

### 2.3 Tool object shape

```ts
api.registerTool(
  {
    name: "iflow_web_search",
    label: "iFlow Web Search",
    description: "...",
    parameters: TypeBoxObjectSchema,
    execute: async (toolCallId: string, params: Record<string, unknown>) => ({
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      details: {},
    }),
  },
  { source: "iflow" },
);
```

Verbatim shape from `openclaw-tavily/index.ts:502–788`.

### 2.4 Web-search-provider object shape

```ts
{
  id: "iflow",
  label: "iFlow Search",
  hint: "Chinese-language web search · image search · web fetch",
  onboardingScopes: ["text-inference"],
  credentialLabel: "iFlow Search API key",
  envVars: ["IFLOW_API_KEY"],
  placeholder: "sk-...",
  signupUrl: "https://platform.iflow.cn",
  docsUrl: "https://platform.iflow.cn/docs",
  autoDetectOrder: 80,           // sits between Tavily (70) and DuckDuckGo (100)
  credentialPath: "plugins.entries.iflow.config.webSearch.apiKey",
  ...createWebSearchProviderContractFields({
    credentialPath: "plugins.entries.iflow.config.webSearch.apiKey",
    searchCredential: { type: "top-level" },
    configuredCredential: { pluginId: "iflow" },
  }),
  createTool: () => null,         // SDK routes managed web_search through provider config
}
```

Shape derived from `@openclaw/brave-plugin@2026.5.7/dist/web-search-contract-api.js`
as a **reference** for the provider contract, with iFlow-specific values
substituted. This shape is not a stable third-party contract; if the SDK rejects
it at runtime, the plugin falls back to tools mode.

`createWebSearchProviderContractFields` is imported from
`openclaw/plugin-sdk/provider-web-search-config-contract` via dynamic `import()`
so the failure surface is a caught rejection, not a module-load error.

### 2.5 Manifest (`openclaw.plugin.json`)

Field names below are taken verbatim from Brave's manifest
(`@openclaw/brave-plugin@2026.5.7/openclaw.plugin.json`):

```json
{
  "id": "iflow",
  "activation": { "onStartup": false },
  "providerAuthEnvVars": { "iflow": ["IFLOW_API_KEY"] },
  "setup": {
    "providers": [
      { "id": "iflow", "authMethods": ["api-key"], "envVars": ["IFLOW_API_KEY"] }
    ]
  },
  "uiHints": {
    "webSearch.apiKey": {
      "label": "iFlow API Key",
      "help": "iFlow Search API key (fallback: IFLOW_API_KEY env var).",
      "sensitive": true,
      "placeholder": "sk-..."
    },
    "webSearch.baseUrl": {
      "label": "iFlow Base URL",
      "help": "Optional proxy/base URL override. Defaults to https://platform.iflow.cn."
    }
  },
  "contracts": { "webSearchProviders": ["iflow"] },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "webSearch": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "apiKey": { "type": ["string", "object"] },
          "baseUrl": { "type": ["string", "object"] },
          "timeoutSeconds": { "type": "number" },
          "cacheTtlMinutes": { "type": "number" }
        }
      }
    }
  }
}
```

`apiKey`/`baseUrl` accept `string` or `object` because OpenClaw resolves
SecretRef objects there (confirmed by Brave manifest accepting the same shape).

### 2.6 Package.json

```json
{
  "name": "@iflow-ai/iflow-plugin",
  "version": "0.1.0",
  "type": "module",
  "files": ["index.ts", "src", "openclaw.plugin.json", "skills", "README.md", "LICENSE"],
  "dependencies": { "@sinclair/typebox": "0.34.47" },
  "peerDependencies": { "openclaw": ">=2025.0.0" },
  "peerDependenciesMeta": { "openclaw": { "optional": true } },
  "openclaw": { "extensions": ["./index.ts"] }
}
```

Ship `.ts` directly — OpenClaw uses jiti to load it (verified by both
openclaw-tavily and @ollama/openclaw-web-search shipping `index.ts` as `main`).

---

## 3. Architecture

### 3.1 Feature-detect dual registration

```ts
register(api) {
  const cfg = resolveConfig(api.pluginConfig ?? {});
  if (!cfg.apiKey) {
    api.logger.warn("iflow: no API key found. Plugin idle.");
    return;
  }

  const client = createIflowClient(cfg, api.logger);

  // Tier 1 — tools mode (stable base, always on)
  registerIflowTools(api, client);

  // Tier 2 — provider mode (best-effort, opt-in by runtime capability)
  void tryRegisterProvider(api, client, cfg).catch((err) => {
    api.logger.info(
      `iflow: provider mode unavailable, staying in tools-only mode (${err.message ?? err})`,
    );
  });

  api.registerService({
    id: "iflow",
    start: () => api.logger.info("iflow: service started"),
    stop: () => api.logger.info("iflow: service stopped"),
  });
}

async function tryRegisterProvider(api, client, cfg) {
  if (typeof api.registerWebSearchProvider !== "function") {
    throw new Error("registerWebSearchProvider not exposed by this OpenClaw runtime");
  }
  // Dynamic import so missing SDK subpath cannot crash plugin load.
  const { createWebSearchProviderContractFields } = await import(
    "openclaw/plugin-sdk/provider-web-search-config-contract"
  );
  api.registerWebSearchProvider(
    createIflowWebSearchProvider(client, cfg, createWebSearchProviderContractFields),
  );
  api.logger.info("iflow: registered as web_search provider (best-effort)");
}
```

Tools mode is the supported baseline; provider mode is a **best-effort enhancement**
that activates only when the running OpenClaw exposes both
`api.registerWebSearchProvider` and the SDK subpath. Any failure is caught and
logged at info level — the plugin continues to work.

### 3.2 File layout

```
@iflow-ai/iflow-plugin/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── LICENSE
├── .npmignore
├── index.ts                              # definePluginEntry; wires provider + tools
├── src/
│   ├── config.ts                         # apiKey/baseUrl/timeout/cacheTtl resolution
│   ├── client.ts                         # HTTP: bearer + timeout + error classification
│   ├── normalize.ts                      # iFlow raw response → normalized shape
│   ├── errors.ts                         # error taxonomy + formatting
│   ├── tools.ts                          # 3 tool definitions (schema + execute)
│   ├── web-search-provider.ts            # createIflowWebSearchProvider()
│   └── __tests__/
│       ├── normalize.test.ts             # field mapping, missing-field tolerance
│       ├── client.test.ts                # 401/403/429/timeout/success:false
│       └── tools.test.ts                 # input validation, response format
├── skills/
│   └── iflow-search/SKILL.md             # agent guidance
└── scripts/
    └── smoke.mjs                         # manual local probe of 3 endpoints
```

### 3.3 Module responsibilities

| Module | What it does | What it depends on |
|---|---|---|
| `config.ts` | Parse `pluginConfig` → `{ apiKey, baseUrl, timeoutMs, cacheTtlMs }`. Env fallback for `apiKey`. | none |
| `errors.ts` | Define `IflowError` union: `missing_key` / `api_error` (HTTP non-2xx) / `network_timeout` / `network_error` / `api_business_error` (`success: false`). Render to `{ error, status?, message, docs? }`. | none |
| `client.ts` | `iflowSearch(query, count)`, `iflowImageSearch(query, count)`, `iflowFetch(url)`. AbortController timeout, Bearer auth, classify errors. Never logs key. | `errors.ts`, `config.ts` |
| `normalize.ts` | Map raw responses to spec output (see §4). Tolerant of missing fields. | none |
| `tools.ts` | TypeBox schemas + `execute` fns for 3 tools. | `client.ts`, `normalize.ts`, `errors.ts` |
| `web-search-provider.ts` | `createIflowWebSearchProvider(client, cfg)` returning the provider object. | `client.ts`, `normalize.ts` |
| `index.ts` | `definePluginEntry` entry. Feature-detect + wire-up. | all of `src/*` |

### 3.4 Caching

15-minute in-memory cache (matches `openclaw-tavily` and OpenClaw built-in
`web_search`). Cache key = `iflow:<tool>:<query|url>:<count>` lowercased.
Configurable via `cacheTtlMinutes`. Capacity cap 100 entries with FIFO eviction.

---

## 4. Normalize layer (final, based on verified responses)

### 4.1 `iflow_web_search`

Raw iFlow response:
```jsonc
{
  "success": true, "code": "200", "message": "操作成功", "exception": null,
  "data": {
    "organic": [
      { "title": "...", "link": "https://...", "snippet": "...", "position": 1, "date": null }
    ],
    "query": "...", "errorMsg": null, "errorCode": null
  },
  "extra": null
}
```

Normalized:
```jsonc
{
  "query": "Java Spring Boot 教程",
  "provider": "iflow",
  "tookMs": 1383,
  "count": 3,
  "results": [
    { "title": "...", "url": "...", "snippet": "...", "position": 1, "date": null }
  ]
}
```

Mapping rules:
- `data.organic[].link` → `results[].url` (load-bearing rename)
- `data.organic[].{title,snippet,position,date}` → straight through
- `data.query` → top-level `query`, falling back to request query
- If `data.organic` is undefined or null, `results: []`
- If `success !== true`, surface as `api_business_error`

### 4.2 `iflow_image_search`

Raw response:
```jsonc
{
  "success": true, ...,
  "data": [
    { "url": "https://...jpg", "title": "小猫", "refUrl": "https://..." }
  ],
  "extra": null
}
```

Normalized:
```jsonc
{
  "query": "小猫",
  "provider": "iflow",
  "tookMs": 1715,
  "count": 3,
  "images": [
    { "url": "...", "title": "小猫", "sourceUrl": "..." }
  ]
}
```

Mapping rules:
- `data` is a **flat array** (NOT `data.images`)
- `data[].refUrl` → `images[].sourceUrl` (load-bearing rename)
- `data[].{url,title}` → straight through
- If `data` is not an array, `images: []`

### 4.3 `iflow_web_fetch`

Raw response:
```jsonc
{
  "success": true, ...,
  "data": {
    "title": "百度一下，你就知道",
    "content": "...",
    "url": "https://www.baidu.com",
    "fromCache": true,
    "errorMsg": null, "errorCode": null
  },
  "extra": null
}
```

Normalized:
```jsonc
{
  "title": "百度一下，你就知道",
  "url": "https://www.baidu.com",
  "content": "...",
  "fromCache": true,
  "provider": "iflow",
  "tookMs": 335
}
```

Mapping rules:
- `data.{title,content,url,fromCache}` → straight through
- `title` falls back to `null` if missing
- `fromCache` falls back to `null` if missing
- If `success !== true`, surface as `api_business_error`

### 4.4 Error envelope handling

Every endpoint wraps responses in `{ success, code, message, exception, data, extra }`.

Decision tree:
1. Network failure / abort → `network_error` or `network_timeout`
2. HTTP non-2xx → `api_error` with `status` and `message` from body
3. HTTP 2xx but `success !== true` → `api_business_error` with `code`, `message`, `exception`, `data.errorMsg`, `data.errorCode`
4. Otherwise → success, normalize and return

---

## 5. Tool parameter schemas

### 5.1 `iflow_web_search`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | — | Sent as iFlow `keywords` |
| `count` | number | no | 10 | Clamped to `[1, 10]`. Sent as iFlow `num` |

### 5.2 `iflow_image_search`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | — | Sent as iFlow `keywords` |
| `count` | number | no | 10 | Clamped to `[1, 20]`. Sent as iFlow `num` |

### 5.3 `iflow_web_fetch`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `url` | string | yes | — | Must be http(s) URL |

Validation via `@sinclair/typebox` `Type.Object({...})` schemas (same library as
`openclaw-tavily`).

---

## 6. Config resolution

Resolution order for `apiKey`:
1. `plugins.entries.iflow.config.webSearch.apiKey` (string or SecretRef object)
2. `IFLOW_API_KEY` environment variable

`baseUrl` default: `https://platform.iflow.cn`. Trailing slash stripped.

`timeoutSeconds` default: `30`.

`cacheTtlMinutes` default: `15`. Set to `0` to disable cache.

---

## 7. Security & logging hygiene

- API key never appears in logs, error messages, cache keys, or test snapshots.
- HTTP errors log `status` and method/endpoint but not body (which may contain
  sensitive info) and not auth headers.
- README examples use `sk-...` placeholder only.

---

## 8. Tests

`vitest` with `node` test environment. Coverage:

- `normalize.test.ts` — empty `data.organic`, missing `position`, missing `data` entirely, `success: false`, image array missing `refUrl`, fetch missing `fromCache`
- `client.test.ts` — `vi.stubGlobal("fetch", ...)`: 401, 403, 429, 5xx, timeout, network error, `success: false`
- `tools.test.ts` — input validation (missing `query`, invalid `count`, invalid `url`), error pass-through

Test runner: `vitest run` + `tsc --noEmit` typecheck.

No live iFlow calls in CI. Provide `scripts/smoke.mjs` for manual probing
(reads `IFLOW_API_KEY` from env).

---

## 9. SKILL.md (skills/iflow-search/)

Frontmatter format mirrors `openclaw-tavily/skills/tavily-search/SKILL.md`:

```yaml
---
name: iflow-search
description: 中文优先的网页搜索 / 图片搜索 / 网页内容抓取，via iFlow Search API
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
        "requires": { "env": ["IFLOW_API_KEY"] },
        "primaryEnv": "IFLOW_API_KEY",
      },
  }
---
```

Body guidance covers:
- Use `iflow_web_search` when you need fresh public web information (中文场景尤佳)
- Use `iflow_image_search` for visual references / product / location / person pics
- Use `iflow_web_fetch` when the user gives a URL and wants reading/summary/extraction
- Recommended research flow: search → filter URLs → fetch → summarize
- Do NOT use these for local files or non-public sources

---

## 10. README sections

1. Plugin overview
2. Install (`openclaw plugins install @iflow-ai/iflow-plugin`)
3. Environment variable (`IFLOW_API_KEY`)
4. OpenClaw config example (with `tools.web.search.provider: "iflow"`)
5. Direct tool usage (3 examples)
6. Local dev (`npm install`, `npm run typecheck`, `npm test`, `node scripts/smoke.mjs`)
7. Troubleshooting: missing key / 401 / 403 / 429 / timeout / unexpected fields
8. Compatibility: tools mode is the supported baseline on stock OpenClaw; provider mode (managed `web_search` routing) is a best-effort enhancement that activates only if the running OpenClaw exposes `registerWebSearchProvider`. No specific OpenClaw version is promised for provider mode.

---

## 11. Risks & follow-ups

1. **`registerWebSearchProvider` is unverified for third-party plugins.** Only seen
   in bundled `@openclaw/brave-plugin@2026.5.7`. Mitigation: tools mode is the
   supported baseline; provider mode is wrapped in feature detection + dynamic
   import + try/catch. Failure path logs at info and leaves the plugin functional.
2. **`autoDetectOrder: 80` may collide** with a future official provider. Easy to
   bump if needed.
3. **`@iflow-ai` npm scope publish permission.** User confirmed they want this
   scope — they own / will obtain publish rights.
4. **Rate limit semantics unknown.** Assume HTTP 429; revisit if iFlow returns
   `success: false` + a specific `code` instead. Already handled by the `api_business_error` branch.
5. **No `total` / `page` info from iFlow.** Pagination not exposed.
6. **`createWebSearchProviderContractFields` signature** read from compiled JS,
   not from `.d.ts`. The args used (`credentialPath`, `searchCredential.type:"top-level"`,
   `configuredCredential.pluginId`) match Brave verbatim. The dynamic-import +
   try/catch wrapper above contains any signature drift to a single warning log;
   tools mode keeps working regardless.

---

## 12. Deliverables (step 2)

When the user approves this design:

- All files listed in §3.2
- Sample tool calls (with redacted outputs)
- Test run output (typecheck + vitest)
- Manual smoke-test invocation example (without leaking key)
- A "fields to revisit if iFlow API changes" checklist at the top of `normalize.ts`
