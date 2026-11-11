// Puzzle / human checks seen in the Android player (MainActivity RushFlixProgress.puzzle
// saves the last 5 here). Sent with bug reports so the site behind them can be found.
export const PLAYER_DIAG_KEY = "rushflix_player_diag";

export function getPlayerDiag(store = globalThis.localStorage) {
  try {
    const list = JSON.parse(store.getItem(PLAYER_DIAG_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearPlayerDiag(store = globalThis.localStorage) {
  try { store.removeItem(PLAYER_DIAG_KEY); } catch { /* storage unavailable */ }
}

// Markdown block for the GitHub issue body; "" when nothing was recorded.
export function formatPlayerDiag(entries) {
  if (!entries || !entries.length) return "";
  const clean = (s) => String(s ?? "").replace(/[`\r\n]/g, " ").slice(0, 200);
  const lines = entries.map((e) =>
    `- ${new Date(e.time || 0).toISOString()} · ${clean(e.host)}${clean(e.path)}` +
    ` (player ${clean(e.player) || "?"}) · 3rd party: ${clean(e.thirdParty) || "none"}` +
    ` · "${clean(e.text)}"`
  );
  return ["**Puzzle checks seen in the player:**", ...lines].join("\n");
}
