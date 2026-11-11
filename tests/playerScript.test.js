// @vitest-environment jsdom
// PLAYER_SCRIPT is a JS program kept as a Java string in MainActivity. These tests pull
// it out and run it in a fake page, so a broken quote or regex fails here, not on the TV.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A plain path: under jsdom, URL is jsdom's own and readFileSync rejects it.
const JAVA = resolve(process.cwd(), "android/app/src/main/java/com/rushflix/app/MainActivity.java");

function extractPlayerScript(java) {
  const start = java.indexOf("PLAYER_SCRIPT =");
  const block = java
    .slice(start, java.indexOf('";', start) + 2)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => m[1].replace(/\\(["\\'])/g, "$1"))
    .join("");
}

const SCRIPT = extractPlayerScript(readFileSync(JAVA, "utf8"));

function run() {
  delete window.__rfInit;
  new Function(SCRIPT)();
}

describe("PLAYER_SCRIPT", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    window.RushFlixProgress = { puzzle: vi.fn(), videoReady: vi.fn(), report: vi.fn() };
  });
  afterEach(() => vi.useRealTimers());

  it("is valid JavaScript", () => {
    expect(SCRIPT.length).toBeGreaterThan(1000);
    expect(() => new Function(SCRIPT)).not.toThrow();
  });

  it("reports a slider puzzle with the site and third-party hosts", () => {
    document.body.innerHTML =
      "<div>Drag the slider to fit the puzzle</div><div>Slide to complete the puzzle</div>" +
      '<iframe src="https://puzzle.example.net/frame?token=secret"></iframe>' +
      '<script src="/local.js"></script>';
    run();
    vi.advanceTimersByTime(1600);
    const p = window.RushFlixProgress.puzzle;
    expect(p).toHaveBeenCalledTimes(1);
    const [host, , thirdParty, text] = p.mock.calls[0];
    expect(host).toBe(location.hostname);
    expect(thirdParty).toBe("puzzle.example.net");
    expect(text).toContain("Drag the slider");
    expect(p.mock.calls[0].join(" ")).not.toContain("secret");
  });

  it("reports a puzzle that appears a few seconds after load", () => {
    run();
    vi.advanceTimersByTime(4000);
    document.body.innerHTML = "<p>Please verify you are human</p>";
    vi.advanceTimersByTime(1600);
    expect(window.RushFlixProgress.puzzle).toHaveBeenCalledTimes(1);
  });

  it("stays quiet on a normal page", () => {
    document.body.innerHTML = "<div>Game of Thrones 2011 · S01 E01</div>";
    run();
    vi.advanceTimersByTime(70000);
    expect(window.RushFlixProgress.puzzle).not.toHaveBeenCalled();
  });

  it("stops checking after about a minute", () => {
    run();
    vi.advanceTimersByTime(70000);
    document.body.innerHTML = "<div>Slide to complete the puzzle</div>";
    vi.advanceTimersByTime(5000);
    expect(window.RushFlixProgress.puzzle).not.toHaveBeenCalled();
  });

  it("clears Cineby's own movie positions only", () => {
    localStorage.setItem("vs_mov_550", "600");
    localStorage.setItem("other", "1");
    run();
    expect(localStorage.getItem("vs_mov_550")).toBeNull();
    expect(localStorage.getItem("other")).toBe("1");
  });

  it("blocks popups", () => {
    run();
    expect(window.open("https://ad.example.com")).toBeNull();
  });

  it("refuses ad loader scripts from throwaway domains", () => {
    run();
    const bad = document.createElement("script");
    bad.src = "https://qr-scam.cfd/a.js";
    expect(bad.type).toBe("rf/blocked");
    const bad2 = document.createElement("script");
    bad2.setAttribute("src", "https://x.monster/b.js");
    expect(bad2.type).toBe("rf/blocked");
    const ok = document.createElement("script");
    ok.src = "https://cdn.example.com/player.js";
    expect(ok.type).toBe("");
  });
});
