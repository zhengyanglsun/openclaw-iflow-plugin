---
name: iflow-search
description: 中文优先的网页搜索 / 图片搜索 / 网页内容抓取，via iFlow Search (心流搜索) API. Use when the agent needs fresh public web information, image references, or to read the content of a specific URL.
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

# iFlow Search

AI-optimized web tools using the [iFlow Open Platform API](https://platform.iflow.cn).
Three tools for search, image search, and single-page content fetch.

## When to use which tool

- **`iflow_web_search`** — Whenever the agent needs current, public web
  information: news, fact-checking, finding references, looking up Chinese-language
  resources, comparing claims across sources.
- **`iflow_image_search`** — When the user wants visual references: photos of
  people, places, animals, products, landmarks, diagrams, screenshots.
- **`iflow_web_fetch`** — When the user provides a specific URL and asks the
  agent to read it, summarize it, extract data from it, or quote from it.

## Default routing

When this plugin is active and registered as the `web_search` provider, the
managed `web_search` tool routes to iFlow automatically. The three explicit
tools above are always available regardless of provider routing.

## Recommended research flow

For multi-source research questions:

1. Call `iflow_web_search` with a focused query.
2. From the returned results, pick 2–4 URLs that look most relevant.
3. Call `iflow_web_fetch` on each selected URL to get clean page content.
4. Summarize, compare, or quote across the fetched content. Cite source URLs.

For visual / product / location questions:

1. Call `iflow_image_search` to surface candidate images.
2. If the user wants context (article, product page, source attribution),
   follow up with `iflow_web_fetch` on the image's `sourceUrl`.

## When NOT to use

- The user asks about files on the local disk, internal databases, or private
  artifacts. These tools only see the public web.
- The user explicitly asks for a different search provider.
- The query is plainly conversational ("write a poem about cats") with no
  factual lookup component.

## Setup

The plugin needs an API key from the [iFlow Open Platform](https://platform.iflow.cn).
Either set `IFLOW_API_KEY` in the gateway environment, or configure it in your
OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "iflow": {
        "enabled": true,
        "config": {
          "webSearch": { "apiKey": "sk-..." }
        }
      }
    }
  }
}
```

## Tool response shapes

`iflow_web_search`:

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

`iflow_image_search`:

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

`iflow_web_fetch`:

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

On failure, every tool returns `{ "error": "<code>", "message": "...", "status"?, "code"?, "docs"? }`.
Error codes: `missing_api_key`, `missing_param`, `invalid_param`,
`network_timeout`, `network_error`, `api_error`, `api_business_error`.

## Links

- iFlow Open Platform docs: https://platform.iflow.cn/docs/
- Plugin package: `@iflow-ai/iflow-plugin`
