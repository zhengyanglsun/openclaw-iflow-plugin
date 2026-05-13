# @iflow-ai/iflow-plugin

[iFlow Search (心流搜索)](https://platform.iflow.cn) plugin for [OpenClaw](https://docs.openclaw.ai).

Three agent tools backed by iFlow's `/api/search/*` endpoints:

| Tool | Purpose |
|---|---|
| `iflow_web_search` | Public web search with structured results (title / url / snippet / position / date). |
| `iflow_image_search` | Image search with source-page attribution. |
| `iflow_web_fetch` | Read the clean content of a single web page. |

The plugin also registers `iflow` as a `web_search` provider so users can route
the managed `web_search` tool through iFlow with one config line — this is
**best-effort** and activates only if the running OpenClaw exposes the
provider-registration API; otherwise the plugin runs in tools-only mode.

## Install

```bash
openclaw plugins install @iflow-ai/iflow-plugin
openclaw gateway restart
```

Or from a local checkout (during development):

```bash
git clone <repo> ~/.openclaw/extensions/iflow-plugin
cd ~/.openclaw/extensions/iflow-plugin
npm install --omit=dev
openclaw gateway restart
```

## Configuration

### 1. API key

Get one from the [iFlow Open Platform](https://platform.iflow.cn).

Either set the env var:

```bash
export IFLOW_API_KEY=sk-...
```

Or put it in `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    entries: {
      iflow: {
        enabled: true,
        config: {
          webSearch: {
            apiKey: "sk-...",     // sensitive; can also be a SecretRef object
            baseUrl: "https://platform.iflow.cn",  // optional override
            timeoutSeconds: 30,    // optional, default 30
            cacheTtlMinutes: 15    // optional, default 15; set 0 to disable
          }
        }
      }
    }
  }
}
```

### 2. Route managed `web_search` through iFlow (optional)

```json5
{
  tools: {
    web: {
      search: {
        provider: "iflow"
      }
    }
  }
}
```

If your OpenClaw runtime does not support third-party `web_search` providers,
this line has no effect — the explicit tools below still work.

## Tools

### `iflow_web_search`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | — | Sent as iFlow `keywords` |
| `count` | number | no | 10 | Clamped to `[1, 10]`. Sent as iFlow `num` |

Returns:

```json
{
  "query": "...",
  "provider": "iflow",
  "count": 3,
  "tookMs": 1383,
  "results": [
    { "title": "...", "url": "...", "snippet": "...", "position": 1, "date": null }
  ]
}
```

### `iflow_image_search`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | — | Sent as iFlow `keywords` |
| `count` | number | no | 10 | Clamped to `[1, 20]`. Sent as iFlow `num` |

Returns:

```json
{
  "query": "...",
  "provider": "iflow",
  "count": 3,
  "tookMs": 1715,
  "images": [
    { "url": "...jpg", "title": "...", "sourceUrl": "..." }
  ]
}
```

### `iflow_web_fetch`

| Param | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | Must be an http(s) URL |

Returns:

```json
{
  "title": "...",
  "url": "...",
  "content": "...",
  "fromCache": true,
  "provider": "iflow",
  "tookMs": 335
}
```

## Pair with TweetClaw for X/Twitter workflows

Use iFlow when OpenClaw needs public web search, image search, or clean page
fetches. If the same research path needs X/Twitter-specific data or actions,
install the [TweetClaw OpenClaw plugin](https://github.com/Xquik-dev/tweetclaw):

```bash
openclaw plugins install @xquik/tweetclaw@latest
openclaw gateway restart
```

TweetClaw covers X/Twitter jobs that are outside general web search: search
tweets, search tweet replies, user lookup, follower export, media download,
media upload, direct messages, monitor tweets, webhooks, giveaway draws, and
approval-gated posts or replies. A practical split is to use iFlow for broad
web sources and source-page context, then use TweetClaw for X/Twitter-native
research, monitoring, and visible actions the user explicitly approves.

Example prompt:

> Use iFlow to fetch the launch article and related web coverage, then use
> TweetClaw to search tweets and tweet replies about the launch before drafting
> a response plan.

## Local development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (uses mocked fetch, no live API calls)

# Optional: live probe of all three endpoints.
# Reads IFLOW_API_KEY from the env. Does NOT log the key.
IFLOW_API_KEY=sk-... npm run smoke
IFLOW_API_KEY=sk-... npm run smoke web     # web only
IFLOW_API_KEY=sk-... npm run smoke image
IFLOW_API_KEY=sk-... npm run smoke fetch
```

To exercise the plugin inside a real OpenClaw gateway:

```bash
# 1. Pack and install from the local build
npm pack
openclaw plugins install npm-pack:./iflow-ai-iflow-plugin-0.1.0.tgz
openclaw gateway restart

# 2. Verify what was registered
openclaw plugins inspect iflow --runtime --json
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every call returns `missing_api_key` | Env var not loaded by the gateway | Restart gateway after exporting `IFLOW_API_KEY`, or put the key in `openclaw.json` |
| `api_error` with `status: 401` | Wrong / revoked key | Rotate the key on the iFlow platform |
| `api_error` with `status: 403` | Account not entitled to this endpoint | Check the iFlow plan / contact iFlow support |
| `api_error` with `status: 429` | Rate limit | Lower request rate; the plugin caches identical queries for `cacheTtlMinutes` |
| `network_timeout` | Slow upstream / cold cache | Increase `timeoutSeconds`; retry |
| `api_business_error` with code `4xxx` | iFlow returned `success: false` | Inspect `message` / `code` in the error payload |
| Results have a `url` field on iFlow but show as empty | iFlow renamed `link` → `url` (or similar) | Update `src/normalize.ts` mapping; tests in `src/__tests__/normalize.test.ts` show where |
| Plugin loads but `web_search` doesn't route through iFlow | OpenClaw runtime doesn't expose `registerWebSearchProvider` (info log will say so) | Use the explicit `iflow_web_search` tool instead, or upgrade OpenClaw |

## Compatibility

- `peerDependency`: `openclaw >= 2025.0.0` (optional)
- **Tools mode** (3 explicit tools): always on.
- **Provider mode** (managed `web_search` routing): activates only when the
  runtime exposes `api.registerWebSearchProvider` AND the SDK subpath
  `openclaw/plugin-sdk/provider-web-search-config-contract` is importable.
  Failure is logged at info level; the plugin keeps working in tools mode.

## Acknowledgements

This plugin includes an OpenClaw-specific skill definition under
`skills/iflow-search/SKILL.md`. It is adapted from the official iFlow skill
catalog, but uses OpenClaw tool names and normalized parameters / return
fields instead of the upstream shell-script interface.

Official iFlow skill reference:
https://github.com/iflow-ai/iflow-skills/tree/main/skills/iflow-search

## License

MIT
