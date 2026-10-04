/* global __APP_VERSION__ */

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2.7.1";

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

/**
 * Fetch the latest GitHub release. Returns { latest, apkUrl, ipkUrl, releaseNotes }.
 * Throws a human-readable Error on any failure.
 * Rate limit is 60 requests/hour per IP — fine for the 6h startup cooldown
 * plus manual checks.
 */
export async function fetchLatestRelease() {
  let res;
  try {
    res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("Could not reach GitHub. Check internet connection.");
  }
  if (res.status === 403 || res.status === 429)
    throw new Error("GitHub rate limit hit. Try again in an hour.");
  if (res.status === 404)
    throw new Error("No releases found on GitHub.");
  if (!res.ok)
    throw new Error(`GitHub returned status ${res.status}.`);

  let data;
  try { data = await res.json(); }
  catch { throw new Error("Invalid response from GitHub."); }

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
