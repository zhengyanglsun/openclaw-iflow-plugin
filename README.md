# iFlow Search for OpenClaw

> Connect Your AI Agent to the Real World.

[iFlow Search (心流搜索)](https://platform.iflow.cn) plugin for [OpenClaw](https://docs.openclaw.ai). Chinese-first web search with structured, LLM-friendly results.

## Features

- **Web search provider** — register `iflow` as the managed `web_search` provider
- **Three explicit tools** — `iflow_web_search`, `iflow_image_search`, `iflow_web_fetch`
- **Structured results** — title, URL, snippet, position, date; images carry `sourceUrl`
- **Chinese-first index** — strong coverage of CN-language sources

## Install

```bash
openclaw plugins install @iflow-ai/iflow-plugin@0.1.5
openclaw gateway restart
```

## Get an API Key

1. Sign up at [platform.iflow.cn](https://platform.iflow.cn)
2. Create an API key in the dashboard

## Configure

### Option A — wizard (recommended)

```bash
openclaw configure --section web
```

Pick **iFlow Search**, paste your API key.

### Option B — environment variable

```bash
export IFLOW_API_KEY="your-key-here"
openclaw gateway restart
```

Then set the routing in your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "tools": { "web": { "search": { "enabled": true, "provider": "iflow" } } }
}
```

### Config options

| Option | Default | Description |
|---|---|---|
| `webSearch.apiKey` | `IFLOW_API_KEY` env | API key (string or SecretRef) |
| `webSearch.baseUrl` | `https://platform.iflow.cn` | API endpoint |
| `webSearch.timeoutSeconds` | `30` | HTTP timeout |
| `webSearch.cacheTtlMinutes` | `15` | Cache TTL (0 to disable) |

## Tools

### `iflow_web_search`

Search the public web. Returns titles, URLs, snippets, and dates.

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | — | Search query |
| `count` | number | 10 | Results count (1–10) |

### `iflow_image_search`

Search for images. Returns image URLs, titles, and source pages.

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | — | Search query |
| `count` | number | 10 | Results count (1–20) |

### `iflow_web_fetch`

Fetch readable content from a URL. Returns title, markdown content, and cache info.

| Param | Type | Description |
|---|---|---|
| `url` | string | HTTP(S) URL to fetch |

## Verify

```bash
openclaw plugins inspect iflow --json
openclaw infer web search --query "OpenClaw" --limit 3 --json
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `missing_api_key` | Export `IFLOW_API_KEY` or set `webSearch.apiKey` in config |
| Provider not showing | Set `tools.web.search.provider = "iflow"` and restart gateway |
| `version: 0.1.2` installed | Reinstall: `openclaw plugins install @iflow-ai/iflow-plugin@0.1.5 --force` |
| `registerWebSearchProvider not exposed` | Normal — plugin falls back to tools-only mode automatically |

## Security

- Never commit your API key — use env vars or SecretRef
- Plugin only logs whether key is configured (boolean), never the key itself
- Attribution headers (`IFlow-Source`, `IFlow-Integration`, `IFlow-Integration-Version`) contain no secrets

## Local Development

```bash
npm install
npm run typecheck
npm test
npm run smoke        # optional, needs IFLOW_API_KEY
```

## License

MIT
