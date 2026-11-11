import { describe, it, expect } from "vitest";
import { getPlayerDiag, clearPlayerDiag, formatPlayerDiag, PLAYER_DIAG_KEY } from "../src/utils/playerDiag";

function fakeStore(init = {}) {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = v; },
    removeItem: (k) => { delete m[k]; },
  };
}

describe("player puzzle log", () => {
  it("reads saved entries", () => {
    const s = fakeStore({ [PLAYER_DIAG_KEY]: JSON.stringify([{ host: "a.com" }]) });
    expect(getPlayerDiag(s)).toEqual([{ host: "a.com" }]);
  });

  it("survives missing or broken data", () => {
    expect(getPlayerDiag(fakeStore())).toEqual([]);
    expect(getPlayerDiag(fakeStore({ [PLAYER_DIAG_KEY]: "{oops" }))).toEqual([]);
    expect(getPlayerDiag(fakeStore({ [PLAYER_DIAG_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it("clears the log", () => {
    const s = fakeStore({ [PLAYER_DIAG_KEY]: "[]" });
    clearPlayerDiag(s);
    expect(s.getItem(PLAYER_DIAG_KEY)).toBeNull();
  });

  it("formats nothing when empty", () => {
    expect(formatPlayerDiag([])).toBe("");
    expect(formatPlayerDiag(null)).toBe("");
  });

  it("formats one line per check, without markdown breakers", () => {
    const out = formatPlayerDiag([
      { time: 0, host: "x.com", path: "/embed/tv", player: "api.cineby.homes", thirdParty: "p.net", text: "Slide`\nnow" },
    ]);
    expect(out).toContain("**Puzzle checks seen in the player:**");
    expect(out).toContain("1970-01-01T00:00:00.000Z · x.com/embed/tv (player api.cineby.homes) · 3rd party: p.net");
    expect(out).not.toContain("`");
    expect(out.split("\n")).toHaveLength(2);
  });
});
