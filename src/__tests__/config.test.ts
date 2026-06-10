import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE_URL, resolveConfig } from "../config.ts";

describe("resolveConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses IFLOW_BASE_URL as an optional base URL fallback", () => {
    vi.stubEnv("IFLOW_BASE_URL", "https://proxy.example.test/");

    const config = resolveConfig({
      webSearch: {
        apiKey: "test-api-key",
      },
    });

    expect(config.baseUrl).toBe("https://proxy.example.test");
  });

  it("prefers explicit config baseUrl over IFLOW_BASE_URL", () => {
    vi.stubEnv("IFLOW_BASE_URL", "https://env.example.test");

    const config = resolveConfig({
      webSearch: {
        apiKey: "test-api-key",
        baseUrl: "https://config.example.test/",
      },
    });

    expect(config.baseUrl).toBe("https://config.example.test");
  });

  it("falls back to the default base URL when no override is provided", () => {
    const config = resolveConfig({
      webSearch: {
        apiKey: "test-api-key",
      },
    });

    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
