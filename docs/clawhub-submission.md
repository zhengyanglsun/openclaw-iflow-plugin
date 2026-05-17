# ClawHub submission — iFlow Search

> Draft. Not yet submitted. Status fields below reflect the package state at
> the time this document was generated.

## 1. Plugin name

**iFlow Search**

## 2. Tagline

Connect Your AI Agent to the Real World.

## 3. Package

- npm name: `@iflow-ai/iflow-plugin`
- Pinned version for submission: **`0.1.3`**
- Public on the npm registry (`npm view @iflow-ai/iflow-plugin version` → `0.1.3`)
- npm dist-tags: `latest = 0.1.3`, `beta = 0.1.3`

## 4. Plugin id

`iflow` (matches `openclaw.plugin.json#id` and the `web_search` provider id)

## 5. Source repository

`https://github.com/zhengyanglsun/openclaw-iflow-plugin`

(sourced from `package.json#repository.url`, normalized)

## 6. License

`MIT` (from `package.json#license`)

## 7. Issue tracker

`https://github.com/zhengyanglsun/openclaw-iflow-plugin/issues`

(sourced from `package.json#bugs.url`)

## 8. Homepage

- Product: `https://platform.iflow.cn`
- iFlow API docs: `https://platform.iflow.cn/docs/`

## 9. Description

iFlow Search provides web search, image search, and web content fetch
capabilities for OpenClaw agents, returning structured LLM-friendly results.
Chinese-first index with strong coverage of CN-language sources.

## 10. Capabilities

| Kind | Id | Notes |
|---|---|---|
| `web_search` provider | `iflow` | Manifest contract `webSearchProviders: ["iflow"]`. Best-effort runtime registration via `api.registerWebSearchProvider`; falls back to tools-only mode on hosts that do not expose that API. |
| Tool | `iflow_web_search` | Public web search. |
| Tool | `iflow_image_search` | Image search with source-page attribution. |
| Tool | `iflow_web_fetch` | Clean content of a single URL. |
| Skill | `iflow-search` | `skills/iflow-search/SKILL.md` (agent usage guide). |

## 11. Authentication

- Env var: **`IFLOW_API_KEY`**
- Config path: `plugins.entries.iflow.config.webSearch.apiKey` (string or
  OpenClaw `SecretRef` object)
- Where to get a key: https://platform.iflow.cn
- The plugin redacts the key in logs (`apiKey=***`) and never sends it in
  attribution headers.

## 12. Routing configuration

To make the OpenClaw managed `web_search` capability go through iFlow:

```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "provider": "iflow"
      }
    }
  }
}
```

The plugin only needs to be `enabled` for the tools to be available;
provider routing is independent.

## 13. Install

```bash
openclaw plugins install @iflow-ai/iflow-plugin@0.1.3
openclaw gateway restart
```

Pin the version. `0.1.2` and earlier have a synchronous-registration timing
bug — they install but the `web_search` provider does not become visible to
the OpenClaw runtime.

## 14. Configure

```bash
openclaw configure --section web
```

After install, the wizard's provider list includes "iFlow Search". This is
driven by the plugin's manifest declaring
`contracts.webSearchProviders: ["iflow"]` plus a `configSchema.webSearch`
property — OpenClaw's setup-mode discovery picks it up without any
catalog entry.

## 15. Smoke-test proof (locally verified)

The user path below was verified end-to-end on OpenClaw `2026.5.12-beta.1`
with `@iflow-ai/iflow-plugin@0.1.3` against a fresh profile. The API key
was supplied via the `IFLOW_API_KEY` env var only and **never written to
the profile config**.

| Step | Command | Observed |
|---|---|---|
| Fresh profile install | `openclaw --profile <fresh> plugins install @iflow-ai/iflow-plugin@0.1.3 --force` | `Installed plugin: iflow` |
| Registry verification | `openclaw --profile <fresh> plugins inspect iflow --json` | `version: 0.1.3`; `capabilities: [{ kind: "web-search", ids: ["iflow"] }]`; `contracts.webSearchProviders: ["iflow"]`; `contracts.tools: ["iflow_web_search","iflow_image_search","iflow_web_fetch"]`; install record pins `@0.1.3`. |
| Wizard list source | direct call to `resolveSearchProviderOptions(config)` (the function `configure --section web` uses) | iFlow Search returned at expected position with `pluginId: "iflow"`, `envVars: ["IFLOW_API_KEY"]`, `credentialPath: "plugins.entries.iflow.config.webSearch.apiKey"`. 13 providers total. |
| Live web search | `IFLOW_API_KEY=… openclaw --profile <fresh> infer web search --query "心流搜索 iflow 是什么" --limit 3 --json` | `ok: true`, `provider: "iflow"`, `results.length == 3`, no errors. |
| Config remained clean | post-run inspection of `<profile>/openclaw.json` | `keyWrittenToConfig: false`, `toolsSearchKeyWritten: false`, provider/enabled flags intact. |
| Key handling | env var staged in 0600 tempfile, used once, file removed, `unset IFLOW_API_KEY` | No API key was written to the OpenClaw profile config. The temporary key file was removed after the smoke test. `IFLOW_API_KEY` was unset after the smoke test. Plugin logs the key as `***` (redacted at source). |

## 16. Security notes

- No API key bundled in the package.
- Users supply their own `IFLOW_API_KEY` via env var, OpenClaw config, or
  `SecretRef`.
- Outbound traffic is restricted to `${baseUrl}` (default
  `https://platform.iflow.cn`); `baseUrl` is configurable for trusted
  proxies / on-prem mirrors only.
- API key is redacted in plugin logs.
- No credential is sent in attribution headers
  (`IFlow-Source`, `IFlow-Integration`, `IFlow-Integration-Version` only).
- Plugin performs only HTTPS calls to documented iFlow endpoints
  (`/api/search/web`, `/api/search/image`, `/api/search/fetch`).
- npm package is version-pinned in documentation to `0.1.3`.
- The plugin manifest declares a closed `configSchema`
  (`additionalProperties: false`) for `webSearch.*`.

## 17. Known limitations

- This is a **community plugin**, not an OpenClaw officially bundled
  provider, and (as of submission) is **not in OpenClaw's
  `official-external-plugin-catalog`**. Users must run
  `openclaw plugins install …` before `openclaw configure` will surface
  iFlow Search in the wizard.
- The managed `web_search` provider mode requires both
  `api.registerWebSearchProvider` AND the SDK subpath
  `openclaw/plugin-sdk/provider-web-search-config-contract`. On hosts that
  do not expose either, the plugin remains usable via the three explicit
  tools.

## 18. Review checklist

- [x] Package published on npm at `@iflow-ai/iflow-plugin@0.1.3`.
- [x] `README.md` includes install, configure (wizard + manual), env var,
      smoke test, troubleshooting, security.
- [x] `LICENSE` present (MIT).
- [x] `package.json#repository` populated.
- [x] `package.json#bugs.url` populated.
- [x] `openclaw.plugin.json` declares
      `contracts.webSearchProviders: ["iflow"]` and `contracts.tools` for
      all three tools.
- [x] Plugin loaded on fresh profile (`plugins inspect iflow` → loaded,
      version 0.1.3).
- [x] Capability registry reflects `web-search` for `iflow`.
- [x] Live web search returns `provider: "iflow"` with non-empty results.
- [x] No secrets in repository, package, or this submission doc.
- [ ] ClawHub-side metadata (category, tags, icon, screenshot) — fill in
      at submission time per ClawHub `quickstart.md` requirements.
- [ ] Submission PR opened against `openclaw/clawhub`.

## 19. Maintainer

Submitter / point-of-contact: per `package.json#author` and the GitHub
repo above. Bug reports via the repo issues URL.

## 20. Versioning policy

Semantic versioning per npm. New manifest contracts or breaking config
changes will land on a major. Provider-registration internals (the
best-effort `registerWebSearchProvider` plumbing) may evolve on minor
versions while preserving the public tool surface.

## 21. ClawHub-side metadata (draft)

These fields are pre-filled for the ClawHub submission form. Final
keywords / category vocabulary must be matched against the ClawHub
registry's actual enums at submission time — adjust to the closest
canonical value if any of these are not exact matches.

| Field | Value |
|---|---|
| `category` | `web-search` (TODO: confirm against ClawHub enum; fallbacks: `search-tools`, `web-tools`) |
| `tags` | `web-search`, `image-search`, `web-fetch`, `chinese-content`, `community-plugin`, `iflow` |
| `keywords` | `iflow`, `心流搜索`, `chinese search`, `cn search`, `web search`, `image search`, `web fetch` |
| `family` | `code-plugin` (ClawHub package family for OpenClaw plugins) |
| `verified-on-version` | OpenClaw **`2026.5.12-beta.1`** (locally smoke-tested, see §15) |
| `compat.pluginApi` | `>=2026.3.24-beta.2` (from `package.json#openclaw.compat.pluginApi`) |
| `compat.minGatewayVersion` | `>=2026.3.24-beta.2` (from `package.json#openclaw.compat.minGatewayVersion`) |
| `build.openclawVersion` | `2026.5.7` (from `package.json#openclaw.build.openclawVersion`) |
| `build.pluginSdkVersion` | `2026.5.7` (from `package.json#openclaw.build.pluginSdkVersion`) |
| `support url` | `https://github.com/zhengyanglsun/openclaw-iflow-plugin/issues` (from `package.json#bugs.url`) |
| `changelog url` | https://github.com/zhengyanglsun/openclaw-iflow-plugin/blob/main/CHANGELOG.md |
| `icon` | **TODO** — supply a 64×64 or 128×128 PNG / SVG of the iFlow brand mark. Coordinate with iFlow design / brand team on official-mark licensing before publishing. |
| `screenshot` | **TODO** — provide ≥1 screenshot. Recommended candidates: (a) `openclaw configure --section web` showing "iFlow Search" in the provider list; (b) `openclaw infer web search … --json` showing `provider: "iflow"` plus results. **Redact any visible API key before saving the screenshot** (look for `apiKey`, env-var values, terminal history at the top of the buffer). |
| `pricing notice` | Free tier on iFlow Open Platform; paid tiers available — link to the iFlow platform pricing page if ClawHub asks for one. |

> Treat the `TODO` rows as the only outstanding blockers for submission;
> all other fields above are derived from this repo's existing metadata
> and the locally verified smoke run.

## 22. Pre-submit verification (dry-run)

ClawHub provides a non-publishing dry-run command that previews exactly
what the registry will see — the resolved package metadata, declared
compatibility fields, source-attribution data, and the upload plan —
without uploading the package. **Run this before any real submission**
and confirm the output matches the values in §21 and §15.

```bash
clawhub package publish . --family code-plugin --dry-run
```

What the dry-run validates locally (no upload):

- Resolved package metadata (name, version, license, repository, bugs,
  homepage) matches `package.json` and this submission doc.
- OpenClaw compatibility fields (`compat.pluginApi`,
  `compat.minGatewayVersion`, `build.openclawVersion`,
  `build.pluginSdkVersion`) are picked up correctly.
- Source attribution (git remote / git HEAD) matches the public repo.
- The upload plan lists only the files declared in `package.json#files`
  (`dist/`, `openclaw.plugin.json`, `skills/`, `README.md`, `LICENSE`) —
  cross-check that no local `.env`, profile JSON, key file, or screenshot
  with un-redacted secrets has been swept in.

**Do not run the real `publish` (without `--dry-run`) until:**

1. The two real API keys exposed earlier in chat have been rotated /
   revoked on the iFlow and DeepSeek dashboards.
2. The `TODO` rows in §21 (icon, screenshot) are resolved, and the
   soft-TODO rows (`category`, `tags`, `family`) have been confirmed
   against the current ClawHub vocabulary.
3. The Review checklist in §18 is fully ticked.
4. A separate maintainer / owner has reviewed this submission doc and
   `README.md`.
