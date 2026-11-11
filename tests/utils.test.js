// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { parseM3U } from "../src/utils/m3uParser";
import { certToMinAge, isRestricted } from "../src/utils/ageRating";
import { getSourceUrl, saveSourceRedirect } from "../src/utils/api";

describe("parseM3U", () => {
  it("reads channel fields and skips non-http entries", () => {
    const list = parseM3U([
      "#EXTM3U",
      '#EXTINF:-1 tvg-id="bbc1.uk" tvg-logo="https://l/bbc.png" group-title="News" tvg-language="English" tvg-country="UK",BBC One',
      "https://s/bbc.m3u8",
      "#EXTINF:-1,Local File",
      "rtmp://not-http",
      "#EXTINF:-1,No Fields",
      "http://s/plain.m3u8",
    ].join("\n"));
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      name: "BBC One", logo: "https://l/bbc.png", group: "News", tvgId: "bbc1.uk",
      language: "English", country: "UK", url: "https://s/bbc.m3u8",
    });
    expect(list[1]).toMatchObject({ name: "No Fields", group: "Uncategorized", logo: null });
  });
});

describe("age ratings", () => {
  it("maps certificates to ages", () => {
    expect(certToMinAge("PG-13", "US")).toBe(13);
    expect(certToMinAge("12A", "GB")).toBe(12);
    expect(certToMinAge("R", "XX")).toBe(17); // unknown country → US table
    expect(certToMinAge("", "US")).toBeNull();
    expect(certToMinAge("weird", "US")).toBeNull();
  });

  it("restricts only above the limit", () => {
    expect(isRestricted(17, 13)).toBe(true);
    expect(isRestricted(13, 13)).toBe(false);
    expect(isRestricted(null, 13)).toBe(false);
    expect(isRestricted(17, null)).toBe(false);
  });
});

describe("player URLs", () => {
  beforeEach(() => localStorage.clear());

  it("builds Cineby movie and episode URLs", () => {
    expect(getSourceUrl("movie", 550)).toBe("https://api.cineby.homes/embed/movie/550");
    expect(getSourceUrl("tv", 1399, 2, 9)).toBe("https://api.cineby.homes/embed/tv/1399/2/9");
  });

  it("follows a saved domain move", () => {
    expect(saveSourceRedirect("https://new.example/embed")).toBe(true);
    expect(saveSourceRedirect("https://new.example/embed")).toBe(false);
    expect(getSourceUrl("movie", 1)).toBe("https://new.example/embed/movie/1");
  });
});
