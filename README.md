# iFlow Search for OpenClaw (@iflow-ai/iflow-plugin)

> Connect Your AI Agent to the Real World.

`@iflow-ai/iflow-plugin` is the [iFlow Search (心流搜索)](https://platform.iflow.cn)
community plugin for [OpenClaw](https://docs.openclaw.ai). It exposes three
LLM-friendly search/fetch tools and registers `iflow` as an OpenClaw
`web_search` provider so the managed `web_search` capability can be routed
through iFlow with a single config line.

## What you get

- **Web search provider** registered as `iflow` (OpenClaw `web_search`
  capability — routed via `tools.web.search.provider = "iflow"`).
- **Three explicit tools** your agent can call directly:
  - `iflow_web_search` — public web search.
  - `iflow_image_search` — image search with source-page attribution.
  - `iflow_web_fetch` — clean content of a single page.
- **Structured, LLM-friendly results** (`title` / `url` / `snippet` /
  `position` / `date`; image results carry `sourceUrl`).
- **Chinese-first index** with strong coverage of CN-language sources.

This is an OpenClaw **community plugin**, not an officially bundled
provider. Distribution is via npm; submission to ClawHub is planned.

## Install

Pin to the latest known-good version:

```bash
openclaw plugins install @iflow-ai/iflow-plugin@0.1.3
openclaw gateway restart
```

> Pinning matters: on OpenClaw's `beta` update channel, an unpinned
> `@iflow-ai/iflow-plugin` may be rewritten to `@beta`. `0.1.2` and earlier
> have a provider-registration timing bug and **should not be used** —
> always use `0.1.3` or later. Verify with:
>
> ```bash
> openclaw plugins inspect iflow --json | grep -E 'resolvedVersion|version'
> ```

To remove:

```bash
openclaw plugins uninstall iflow
```

## Configure

### Option A — interactive wizard (recommended)

```bash
openclaw configure --section web
```

Pick **"iFlow Search"** from the provider list, then paste your iFlow API key
when prompted. The wizard writes the key into your OpenClaw config (or a
SecretRef, depending on your secret-input mode). The wizard also flips
`plugins.entries.iflow.enabled = true` and
`tools.web.search.provider = "iflow"` for you.

### Option B — manual config edit

> **Prefer Option A (wizard) or Option C (env var) over this.** Hand-editing
> the config means the key sits in a plaintext file on disk and can leak
> via backups, screenshots, or shared workspaces. Use Option B only when
> you fully understand the trade-off.

Edit your profile config (`~/.openclaw/openclaw.json` for the default
profile; `~/.openclaw-<name>/openclaw.json` for named profiles):

```json5
{
  plugins: {
    entries: {
      iflow: {
        enabled: true,
        config: {
          webSearch: {
            apiKey: "sk-REDACTED",                // string (LEAST PREFERRED — see SecretRef below)
            baseUrl: "https://platform.iflow.cn", // optional
            timeoutSeconds: 30,                   // optional, default 30
            cacheTtlMinutes: 15                   // optional, 0 disables cache
          }
        }
      }
    }
  },
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "iflow"
      }
    }
  }
}
```

**Preferred: SecretRef instead of a raw string.** Replace the `apiKey`
line above with an OpenClaw `SecretRef` object so the actual key lives in
the environment (or your OpenClaw secret store), not the config file:

```json5
// inside plugins.entries.iflow.config.webSearch
apiKey: {
  source: "env",
  provider: "openclaw",
  id: "IFLOW_API_KEY"
}
```

With this form, the config can be committed safely; the resolver reads
`IFLOW_API_KEY` from the gateway environment at runtime. This is the same
shape `openclaw configure --section web` writes when run with
`--secret-input-mode=ref`.

Then:

```bash
openclaw gateway restart
```

### Option C — keep the key in the environment only

Skip `webSearch.apiKey` in config and export an env var. The gateway and
local CLI both pick it up:

```bash
export IFLOW_API_KEY=sk-REDACTED
openclaw gateway restart
```

This is the safest option for shared / committed config files.

> **Caveat:** `IFLOW_API_KEY` alone is not enough to make the OpenClaw
> *managed* `web_search` capability route through iFlow. You also need to
> set `tools.web.search.provider = "iflow"` (and `tools.web.search.enabled
> = true`). Until you do, provider-status commands such as
> `openclaw infer web providers --json` may report iFlow with
> `configured: false` even though the env var is present — they only
> consider a provider "configured" when both the credential AND the
> routing selection are in place. The three explicit tools
> (`iflow_web_search` / `iflow_image_search` / `iflow_web_fetch`) work as
> soon as the env var is set, independent of routing.

#### Config knobs

| Path | Type | Default | Notes |
|---|---|---|---|
| `plugins.entries.iflow.config.webSearch.apiKey` | string \| SecretRef | — | Falls back to `IFLOW_API_KEY` env var. |
| `plugins.entries.iflow.config.webSearch.baseUrl` | string | `https://platform.iflow.cn` | For trusted proxies / on-prem mirrors. |
| `plugins.entries.iflow.config.webSearch.timeoutSeconds` | number | `30` | Per-request HTTP timeout. |
| `plugins.entries.iflow.config.webSearch.cacheTtlMinutes` | number | `15` | In-memory cache TTL. Set `0` to disable. |
| `tools.web.search.provider` | string | — | Set to `"iflow"` to route managed `web_search` here. |
| `tools.web.search.enabled` | boolean | — | Master toggle for managed web search. |

Env var: **`IFLOW_API_KEY`**.

## Smoke test

After install + configure, verify end-to-end with the local CLI:

```bash
# Pass the key via env var only — do NOT inline a real key here, since
# that records it in your shell history. Prefer one of:
#   read -s -p 'IFLOW_API_KEY: ' IFLOW_API_KEY; export IFLOW_API_KEY; echo
#   IFLOW_API_KEY="$(security find-generic-password -w -s iflow)"  # macOS keychain
#   IFLOW_API_KEY="$(cat ~/.config/iflow.key)"                     # 0600 file
openclaw infer web search --query "OpenClaw plugin" --limit 3 --json
```

The example value `sk-REDACTED` is illustrative only — substitute your real
key via one of the methods above and `unset IFLOW_API_KEY` (and remove any
tempfile) when done.

Expected output: `provider` is `"iflow"`, `outputs[0].result.results` has 3
non-empty entries, and no `fallback` / `missing_api_key` errors.

You can also verify discovery without firing a request:

```bash
openclaw plugins inspect iflow --json | \
  jq '.capabilities, .contracts'
# capabilities: [{"kind":"web-search","ids":["iflow"]}]
# contracts: { webSearchProviders:["iflow"], tools:[...] }
```

## Tools (direct API)

### `iflow_web_search`

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | string | yes | — | Sent as iFlow `keywords` |
| `count` | number | no | 10 | Clamped to `[1, 10]` |

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
| `count` | number | no | 10 | Clamped to `[1, 20]` |

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

- `url` is always a non-empty string (items without one are dropped).
- `title` is `string | null` (iFlow may omit it).
- `sourceUrl` is `string | null` (mapped from iFlow's `refUrl`; may be
  absent for some image sources).

### `iflow_web_fetch`

| Param | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | http(s) URL only |

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

## Security

- **Never commit your API key.** Don't paste it into shared config files,
  PRs, screenshots, chat transcripts, **or interactive shell commands**
  (your shell history file persists them on disk). If you do, **rotate it
  immediately** on the [iFlow platform](https://platform.iflow.cn) — the
  key remains active in the leaked location until you do.
- For one-off commands, prefer `read -s` to prompt, a 0600 file, or a
  password manager / OS keychain over inline assignments. Unset the env
  var and remove any tempfile when the command is done.
- **Test profiles may contain plaintext keys** under `~/.openclaw-<name>/`
  if Option B was used. Treat those directories as sensitive.
- **Prefer env-var (Option C) or SecretRef** for CI, shared hosts, and any
  profile that lives next to source control.
- The plugin sends only **non-sensitive attribution headers** to iFlow.
  No API key or user query content is included in them. See
  [Attribution headers](#attribution-headers) below for the exact header
  list and meanings.
- The plugin logs the API key as `***` when it loads — it does not write
  the key to any log file.
- Outbound traffic is restricted to `${baseUrl}` (default
  `https://platform.iflow.cn`).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `configure --section web` doesn't show iFlow Search | Plugin not installed | Run `openclaw plugins install @iflow-ai/iflow-plugin@0.1.3` first, then `configure`. |
| `plugins inspect iflow` reports `version: 0.1.2` | Old version installed before the registration fix | Reinstall pinned: `openclaw plugins install @iflow-ai/iflow-plugin@0.1.3 --force`. |
| `web_search` falls back to another provider | `tools.web.search.provider` not set | Set it to `"iflow"`, restart gateway. |
| `missing_api_key` on every call | `IFLOW_API_KEY` not exported, or config has wrong path | Export the env var **before** restarting the gateway, or set `plugins.entries.iflow.config.webSearch.apiKey`. |
| Gateway log says "registerWebSearchProvider not exposed" or "provider mode unavailable" | Older runtime does not expose the managed-provider registration API | No action required — the plugin **automatically falls back to tools-only mode**, and `iflow_web_search` / `iflow_image_search` / `iflow_web_fetch` keep working. To get managed `web_search` routing through iFlow, upgrade to an OpenClaw build that exposes `api.registerWebSearchProvider`. |
| `api_error` with `status: 401` | Wrong / revoked key | Rotate on the iFlow platform; update the env var. |
| `api_error` with `status: 429` | Rate limit | Lower request rate; the plugin caches identical queries for `cacheTtlMinutes`. |

## Local development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (mocked fetch, no live API calls)

# Optional: live probe of all three endpoints. Reads IFLOW_API_KEY from env.
# Set the env var via a non-history-leaking method (see "Smoke test" above):
#   read -s -p 'IFLOW_API_KEY: ' IFLOW_API_KEY; export IFLOW_API_KEY; echo
# `sk-REDACTED` below is a placeholder — do NOT inline a real key.
IFLOW_API_KEY=sk-REDACTED npm run smoke
IFLOW_API_KEY=sk-REDACTED npm run smoke web
IFLOW_API_KEY=sk-REDACTED npm run smoke image
IFLOW_API_KEY=sk-REDACTED npm run smoke fetch
# When done: unset IFLOW_API_KEY
```

To exercise the plugin inside a real OpenClaw gateway from a local build:

```bash
npm pack
openclaw plugins install npm-pack:./iflow-ai-iflow-plugin-0.1.3.tgz
openclaw gateway restart
openclaw plugins inspect iflow --runtime --json
```

## Compatibility

- `peerDependency`: `openclaw >= 2025.0.0` (optional).
- **Tools mode** (the three explicit tools): always on.
- **Provider mode** (managed `web_search` routing via `provider="iflow"`):
  activates when the runtime exposes `api.registerWebSearchProvider` AND
  the SDK subpath `openclaw/plugin-sdk/provider-web-search-config-contract`
  is importable. Failure is logged at info level; the plugin keeps working
  in tools mode.

## Acknowledgements

This plugin ships an OpenClaw-specific skill at
`skills/iflow-search/SKILL.md`, adapted from the official iFlow skill
catalog with OpenClaw tool names and normalized parameters.

Official iFlow skill reference:
https://github.com/iflow-ai/iflow-skills/tree/main/skills/iflow-search

## Attribution headers

The plugin sends non-sensitive attribution headers on every outbound
request to the iFlow API so iFlow can identify requests coming from the
OpenClaw integration:

| Header | Value | Purpose |
|---|---|---|
| `IFlow-Source` | `openclaw` | Identifies the originating runtime (OpenClaw). |
| `IFlow-Integration` | `@iflow-ai/iflow-plugin` | Identifies the integration package name. |
| `IFlow-Integration-Version` | the installed plugin version (e.g. `0.1.3`) | Lets iFlow attribute usage / debug per integration release. |

No API key, user query, or request body content is added to these
attribution headers. The actual API key is sent only via the standard
`Authorization` header to the iFlow Search API endpoint.

## License

MIT
