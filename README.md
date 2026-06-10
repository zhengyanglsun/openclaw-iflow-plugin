# iFlow Search for OpenClaw

> Connect Your AI Agent to the Real World.

[iFlow Search (心流搜索)](https://platform.iflow.cn) is a search API designed for AI applications. OpenClaw exposes it in two ways:

- as the `web_search` provider for the generic search tool
- as explicit plugin tools: `iflow_web_search`, `iflow_image_search`, `iflow_web_fetch`

iFlow returns structured results optimized for LLM consumption with Chinese-first indexing, structured snippets, image search, and web content extraction.

| Property      | Value                                |
| ------------- | ------------------------------------ |
| Plugin id     | `iflow`                              |
| Auth          | `IFLOW_API_KEY` or config `apiKey`   |
| Base URL      | `https://platform.iflow.cn` (default)|
| Bundled tools | `iflow_web_search`, `iflow_image_search`, `iflow_web_fetch` |

## Getting started

### 1. Get an API key

Create an iFlow account at [platform.iflow.cn](https://platform.iflow.cn), then generate an API key in the dashboard.

### 2. Install the plugin

```bash
openclaw plugins install @iflow-ai/iflow-plugin@0.1.6
```

### 3. Configure the plugin and provider

```json5
{
  plugins: {
    entries: {
      iflow: {
        enabled: true,
        config: {
          webSearch: {
            apiKey: "your-key-here", // optional if IFLOW_API_KEY is set
          },
        },
      },
    },
  },
  tools: {
    web: {
      search: {
        provider: "iflow",
      },
    },
    // Enable iFlow explicit tools alongside the coding profile
    alsoAllow: [
      "iflow_web_search",
      "iflow_image_search",
      "iflow_web_fetch"
    ],
  },
}
```

### 4. Verify search runs

Trigger a `web_search` from any agent, or call `iflow_web_search` directly.

> **Tip:** Choosing iFlow in onboarding or `openclaw configure --section web` enables the plugin automatically.

## Understanding provider vs explicit tools

The iFlow plugin exposes two capability layers:

### Web Search Provider

When configured as `tools.web.search.provider = "iflow"`, iFlow powers the built-in **`web_search`** tool. This tool is always visible in the `coding` profile — no extra configuration needed.

### Explicit Tools

The plugin also registers three explicit tools with additional capabilities:

| Tool | Purpose | Why use it |
|------|---------|-----------|
| `iflow_web_search` | Web search with iFlow-specific controls | Direct access, independent of provider routing |
| `iflow_image_search` | **Image search** — not available via `web_search` | The only way to search images through iFlow |
| `iflow_web_fetch` | Fetch web page content | Direct access, independent of provider routing |

> **Important:** `iflow_image_search` is **not** the OpenClaw built-in `image` tool (which is for image understanding/vision). It is a dedicated image search tool that returns image URLs, titles, and source pages.

### Tool visibility and profiles

OpenClaw's `tools.profile` controls which tools are available to the agent:

| Profile | `web_search` (provider) | Explicit tools (`iflow_*`) |
|---------|------------------------|---------------------------|
| `coding` (default) | ✅ Always visible | ❌ Hidden by default |
| `full` | ✅ Always visible | ✅ Visible |
| `coding` + `alsoAllow` | ✅ Always visible | ✅ Visible |

To enable explicit tools with the `coding` profile, add `alsoAllow` to your `tools` config:

```json5
{
  tools: {
    profile: "coding",
    alsoAllow: [
      "iflow_web_search",
      "iflow_image_search",
      "iflow_web_fetch"
    ],
  },
}
```

> **Note:** This is standard OpenClaw behavior — all plugin explicit tools (including Tavily's `tavily_search` and `tavily_extract`) follow the same profile rules.

## Tool reference

### `iflow_web_search`

Search the public web via iFlow Search (心流搜索). Returns titles, URLs, snippets, position, and (when available) publish date. Chinese-language results are first-class.

| Parameter | Type   | Constraints / default | Description                        |
| --------- | ------ | --------------------- | ---------------------------------- |
| `query`   | string | required              | Search query string.               |
| `count`   | number | 1–10, default 10      | Number of results to return.       |

### `iflow_image_search`

Search the public web for images via iFlow Search. Returns image URLs, titles, and source page URLs.

| Parameter | Type   | Constraints / default | Description                        |
| --------- | ------ | --------------------- | ---------------------------------- |
| `query`   | string | required              | Image search query string.         |
| `count`   | number | 1–20, default 10      | Number of images to return.        |

### `iflow_web_fetch`

Fetch the readable content of a single web page via iFlow Search. Returns title, plain-text/markdown content, and a cache hint.

| Parameter | Type   | Constraints / default | Description                        |
| --------- | ------ | --------------------- | ---------------------------------- |
| `url`     | string | required              | HTTP(S) URL to fetch.              |

## Choosing the right tool

| Need                                     | Tool                |
| ---------------------------------------- | ------------------- |
| Quick web search, no special options     | `web_search`        |
| iFlow-specific search with count control | `iflow_web_search`  |
| Image search                             | `iflow_image_search`|
| Extract content from a specific URL      | `iflow_web_fetch`   |

> **Note:** The generic `web_search` tool with iFlow as provider supports `query` and `count` (up to 10 results). For image search or web content extraction, use the explicit tools.

## Advanced configuration

### API key resolution order

The iFlow client looks up its API key in this order:

1. `plugins.entries.iflow.config.webSearch.apiKey` (resolved through SecretRefs).
2. `IFLOW_API_KEY` from the gateway environment.

All tools raise a setup error if neither is present.

### Custom base URL

Override `plugins.entries.iflow.config.webSearch.baseUrl` if you front iFlow through a proxy. The default is `https://platform.iflow.cn`.

### Config options

| Option                    | Default                      | Description                                  |
| ------------------------- | ---------------------------- | -------------------------------------------- |
| `webSearch.apiKey`        | `IFLOW_API_KEY` env var      | API key (string or SecretRef).               |
| `webSearch.baseUrl`       | `https://platform.iflow.cn`  | API endpoint override.                       |
| `webSearch.timeoutSeconds`| `30`                         | HTTP timeout per request in seconds.         |
| `webSearch.cacheTtlMinutes`| `15`                        | In-memory cache TTL in minutes. Set 0 to disable. |

## Verify

```bash
openclaw plugins inspect iflow --runtime --json
```

Check `toolNames` contains all three tools and `diagnostics` is empty.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `missing_api_key` | Export `IFLOW_API_KEY` or set `webSearch.apiKey` in config. |
| Provider not showing | Set `tools.web.search.provider = "iflow"` and restart gateway. |
| Old version installed | Reinstall: `openclaw plugins install @iflow-ai/iflow-plugin@0.1.6 --force` |
| `registerWebSearchProvider not exposed` | Normal — plugin falls back to tools-only mode automatically. |
| Explicit tools not in agent tool list | Add `tools.alsoAllow: ["iflow_web_search", "iflow_image_search", "iflow_web_fetch"]` to your config. Or set `tools.profile = "full"`. See [Tool visibility and profiles](#tool-visibility-and-profiles). |
| `plugins inspect` shows empty `tools:[]` | Normal for factory-registered tools. Use `--runtime` flag to see `toolNames`. |

## Security

- Never commit your API key — use env vars or SecretRef.
- Plugin only logs whether key is configured (boolean), never the key itself.
- Attribution headers (`IFlow-Source`, `IFlow-Integration`, `IFlow-Integration-Version`) contain no secrets.

## Local Development

```bash
npm install
npm run typecheck
npm test
npm run smoke        # optional, needs IFLOW_API_KEY
```

## License

MIT
