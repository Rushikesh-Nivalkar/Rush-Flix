// Optional LAN sync — polls a user-hosted HTTP endpoint (e.g. a JSON file on NAS).
// Fully optional: if no sync URL is configured the app behaves identically to standalone mode.
// Syncs: watchlist (savedList), watch progress, watched flags.
// Does NOT sync: profiles, per-device settings, personal media, credentials.

const SYNC_URL_KEY   = "rushflix_lanSyncUrl";
const SYNC_ENABLED_KEY = "rushflix_lanSyncEnabled";
const SYNC_LAST_KEY  = "rushflix_lanSyncLast";
const SYNC_VERSION_KEY = "rushflix_lanSyncVersion";

const PUSH_DEBOUNCE_MS = 5000;
let pushTimer = null;

export function getLanSyncConfig() {
  return {
    enabled: localStorage.getItem(SYNC_ENABLED_KEY) === "true",
    url: localStorage.getItem(SYNC_URL_KEY) || "",
    lastSync: localStorage.getItem(SYNC_LAST_KEY) ? Number(localStorage.getItem(SYNC_LAST_KEY)) : null,
  };
}

export function setLanSyncConfig({ enabled, url }) {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? "true" : "false");
  localStorage.setItem(SYNC_URL_KEY, url || "");
}

function buildPayload(saved, progress, watched) {
  return {
    version: 1,
    updatedAt: Date.now(),
    saved,
    progress,
    watched,
  };
}

export async function pullSync(url) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
  const data = await res.json();
  if (!data || data.version !== 1) throw new Error("Incompatible sync format.");
  localStorage.setItem(SYNC_LAST_KEY, String(Date.now()));
  return data; // { saved, progress, watched, updatedAt }
}

export async function pushSync(url, saved, progress, watched) {
  const payload = buildPayload(saved, progress, watched);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
  localStorage.setItem(SYNC_LAST_KEY, String(Date.now()));
}

export function schedulePush(url, saved, progress, watched, onError) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushSync(url, saved, progress, watched).catch((err) => onError?.(err));
  }, PUSH_DEBOUNCE_MS);
}
