#!/usr/bin/env node
/**
 * Local smoke test for the iFlow API.
 *
 *   IFLOW_API_KEY=sk-... node scripts/smoke.mjs
 *
 * Optional second arg to pick a single endpoint: web | image | fetch
 *
 *   IFLOW_API_KEY=sk-... node scripts/smoke.mjs web
 *
 * The script does NOT depend on OpenClaw — it talks to platform.iflow.cn
 * directly and prints the normalized result. It deliberately does NOT log the
 * API key.
 */

import { resolveConfig, redactApiKey } from "../src/config.ts";
import { createIflowClient } from "../src/client.ts";
import {
  normalizeImageSearch,
  normalizeWebFetch,
  normalizeWebSearch,
} from "../src/normalize.ts";

const which = (process.argv[2] ?? "all").toLowerCase();

const config = resolveConfig({
  webSearch: {
    timeoutSeconds: 30,
    cacheTtlMinutes: 0,
  },
});

if (!config.apiKey) {
  console.error("smoke: IFLOW_API_KEY is not set in the environment. Aborting.");
  process.exit(2);
}

const logger = {
  info: (m) => console.log(`[info] ${m}`),
  warn: (m) => console.warn(`[warn] ${m}`),
  error: (m) => console.error(`[error] ${m}`),
};

console.log(`smoke: using key ${redactApiKey(config.apiKey)} against ${config.baseUrl}`);

const client = createIflowClient({ config, logger });

async function runWeb() {
  console.log("\n=== iflow_web_search ===");
  const res = await client.webSearch("Java Spring Boot 教程", 3);
  if (!res.ok) {
    console.log(JSON.stringify(res.error, null, 2));
    return;
  }
  console.log(JSON.stringify(normalizeWebSearch(res.data, "Java Spring Boot 教程", res.tookMs), null, 2));
}

async function runImage() {
  console.log("\n=== iflow_image_search ===");
  const res = await client.imageSearch("小猫", 3);
  if (!res.ok) {
    console.log(JSON.stringify(res.error, null, 2));
    return;
  }
  console.log(JSON.stringify(normalizeImageSearch(res.data, "小猫", res.tookMs), null, 2));
}

async function runFetch() {
  console.log("\n=== iflow_web_fetch ===");
  const res = await client.webFetch("https://www.baidu.com");
  if (!res.ok) {
    console.log(JSON.stringify(res.error, null, 2));
    return;
  }
  const normalized = normalizeWebFetch(res.data, "https://www.baidu.com", res.tookMs);
  console.log(JSON.stringify({
    ...normalized,
    content: normalized.content.length > 200 ? normalized.content.slice(0, 200) + "...(truncated)" : normalized.content,
  }, null, 2));
}

if (which === "web") await runWeb();
else if (which === "image") await runImage();
else if (which === "fetch") await runFetch();
else { await runWeb(); await runImage(); await runFetch(); }
