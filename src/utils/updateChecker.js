/* global __APP_VERSION__ */

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2.7.2";

// Must be api.github.com: it sends Access-Control-Allow-Origin: *. The
// github.com/releases.atom feed (used in v2.5.0–v2.7.0) sends no CORS header,
// so fetch() from the app WebView fails and the update check never works.
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/Rushikesh-Nivalkar/Rush-Flix/releases/latest";

/** Parse "vX.Y.Z" or "X.Y.Z" → [major, minor, patch]. Returns [0,0,0] on failure. */
function parseSemver(str) {
  const parts = (str || "").replace(/^v/, "").trim().split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return [0, 0, 0];
  return parts;
}

/** Returns true only when versionA is strictly greater than versionB. */
export function isNewerVersion(versionA, versionB) {
  const [aMaj, aMin, aPat] = parseSemver(versionA);
  const [bMaj, bMin, bPat] = parseSemver(versionB);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

const REQUEST_HEADERS = { Accept: "application/vnd.github+json" };
const TIMEOUT_MS = 10000;

// Android app: native HTTP, which WebView CORS rules can't block.
// Returns null off-native so the caller falls back to fetch.
async function requestNative() {
  const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const res = await CapacitorHttp.request({
    method: "GET",
    url: GITHUB_RELEASES_URL,
    headers: REQUEST_HEADERS,
    connectTimeout: TIMEOUT_MS,
    readTimeout: TIMEOUT_MS,
    responseType: "json",
  });
  let data = res.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  return { status: res.status, data };
}

// Browser / webOS. AbortController + setTimeout instead of AbortSignal.timeout,
// which older Android TV WebViews (pre-Chrome 103) don't have.
async function requestWeb() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_RELEASES_URL, { headers: REQUEST_HEADERS, signal: ctrl.signal });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the latest GitHub release. Returns { latest, apkUrl, ipkUrl, releaseNotes }.
 * Throws a human-readable Error on any failure.
 * Rate limit is 60 requests/hour per IP — fine for the 6h startup cooldown
 * plus manual checks.
 */
export async function fetchLatestRelease() {
  let res = null;
  try { res = await requestNative(); } catch { res = null; } // native failed → try fetch
  if (!res) {
    try { res = await requestWeb(); }
    catch { throw new Error("Could not reach GitHub. Check internet connection."); }
  }
  if (res.status === 403 || res.status === 429)
    throw new Error("GitHub rate limit hit. Try again in an hour.");
  if (res.status === 404)
    throw new Error("No releases found on GitHub.");
  if (res.status < 200 || res.status >= 300)
    throw new Error(`GitHub returned status ${res.status}.`);

  const data = res.data;
  if (!data || typeof data !== "object")
    throw new Error("Invalid response from GitHub.");

  const latest = data.tag_name || "";
  const latestClean = latest.replace(/^v/, "");
  const findAsset = (name) => (data.assets || []).find(
    (a) => a.name?.toLowerCase() === name.toLowerCase()
  )?.browser_download_url ?? null;

  return {
    latest,
    apkUrl: findAsset(`Rush-Flix_V${latestClean}.apk`),
    ipkUrl: findAsset(`Rush-Flix_V${latestClean}.ipk`),
    releaseNotes: (data.body || "").trim(),
  };
}

/**
 * Full update check: fetch release + compare with installed version.
 * Returns { hasUpdate, latest, apkUrl, releaseNotes } or throws.
 */
export async function checkForUpdates() {
  const release = await fetchLatestRelease();
  return {
    hasUpdate: isNewerVersion(release.latest, APP_VERSION),
    ...release,
  };
}
