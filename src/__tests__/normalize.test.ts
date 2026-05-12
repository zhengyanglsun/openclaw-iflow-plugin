import { describe, expect, it } from "vitest";
import {
  normalizeImageSearch,
  normalizeWebFetch,
  normalizeWebSearch,
  type IflowEnvelope,
  type RawImageSearchData,
  type RawWebFetchData,
  type RawWebSearchData,
} from "../normalize.ts";

describe("normalizeWebSearch", () => {
  it("maps the real iFlow shape (link → url) and preserves position/date", () => {
    const raw: IflowEnvelope<RawWebSearchData> = {
      success: true,
      code: "200",
      message: "操作成功",
      data: {
        query: "Spring Boot",
        organic: [
          { title: "T1", link: "https://a.example", snippet: "s1", position: 1, date: null },
          { title: "T2", link: "https://b.example", snippet: "s2", position: 2, date: "2023年12月4日" },
        ],
      },
    };

    const out = normalizeWebSearch(raw, "Spring Boot", 42);

    expect(out.provider).toBe("iflow");
    expect(out.tookMs).toBe(42);
    expect(out.query).toBe("Spring Boot");
    expect(out.count).toBe(2);
    expect(out.results).toEqual([
      { title: "T1", url: "https://a.example", snippet: "s1", position: 1, date: null },
      { title: "T2", url: "https://b.example", snippet: "s2", position: 2, date: "2023年12月4日" },
    ]);
  });

  it("falls back to request query when data.query is absent", () => {
    const raw: IflowEnvelope<RawWebSearchData> = { success: true, data: { organic: [] } };
    const out = normalizeWebSearch(raw, "fallback q", 0);
    expect(out.query).toBe("fallback q");
    expect(out.results).toEqual([]);
  });

  it("treats null/undefined data.organic as empty", () => {
    const out = normalizeWebSearch({ success: true, data: { organic: null } } as IflowEnvelope<RawWebSearchData>, "q", 0);
    expect(out.results).toEqual([]);
    expect(out.count).toBe(0);
  });

  it("survives missing fields on individual results and skips non-objects", () => {
    const raw = {
      success: true,
      data: {
        organic: [
          { title: "T", link: "https://x" },
          null,
          "garbage",
        ],
      },
    } as unknown as IflowEnvelope<RawWebSearchData>;
    const out = normalizeWebSearch(raw, "q", 0);
    expect(out.results).toEqual([
      { title: "T", url: "https://x", snippet: "", position: null, date: null },
    ]);
  });
});

describe("normalizeImageSearch", () => {
  it("maps the real iFlow shape (data is flat array, refUrl → sourceUrl)", () => {
    const raw: IflowEnvelope<RawImageSearchData> = {
      success: true,
      data: [
        { url: "https://img1.jpg", title: "小猫", refUrl: "https://source1" },
        { url: "https://img2.jpg", title: "小猫", refUrl: "https://source2" },
      ],
    };

    const out = normalizeImageSearch(raw, "小猫", 99);

    expect(out.provider).toBe("iflow");
    expect(out.tookMs).toBe(99);
    expect(out.query).toBe("小猫");
    expect(out.count).toBe(2);
    expect(out.images).toEqual([
      { url: "https://img1.jpg", title: "小猫", sourceUrl: "https://source1" },
      { url: "https://img2.jpg", title: "小猫", sourceUrl: "https://source2" },
    ]);
  });

  it("filters out items without a url", () => {
    const raw = {
      success: true,
      data: [
        { url: "https://ok", title: "T", refUrl: null },
        { title: "no-url", refUrl: "https://src" },
      ],
    } as unknown as IflowEnvelope<RawImageSearchData>;
    const out = normalizeImageSearch(raw, "q", 0);
    expect(out.images).toEqual([{ url: "https://ok", title: "T", sourceUrl: null }]);
  });

  it("returns empty list when data is not an array", () => {
    const out = normalizeImageSearch({ success: true, data: undefined }, "q", 0);
    expect(out.images).toEqual([]);
  });
});

describe("normalizeWebFetch", () => {
  it("maps the real iFlow shape and preserves fromCache=true", () => {
    const raw: IflowEnvelope<RawWebFetchData> = {
      success: true,
      data: {
        title: "百度一下，你就知道",
        content: "...content...",
        url: "https://www.baidu.com",
        fromCache: true,
      },
    };

    const out = normalizeWebFetch(raw, "https://www.baidu.com", 10);

    expect(out).toEqual({
      title: "百度一下，你就知道",
      url: "https://www.baidu.com",
      content: "...content...",
      fromCache: true,
      provider: "iflow",
      tookMs: 10,
    });
  });

  it("treats missing fromCache as null (not false)", () => {
    const out = normalizeWebFetch({ success: true, data: { url: "u", content: "c" } }, "u", 0);
    expect(out.fromCache).toBeNull();
    expect(out.title).toBeNull();
  });

  it("falls back to request URL when data.url is missing", () => {
    const out = normalizeWebFetch({ success: true, data: { content: "c" } }, "https://fallback", 0);
    expect(out.url).toBe("https://fallback");
    expect(out.content).toBe("c");
  });
});
