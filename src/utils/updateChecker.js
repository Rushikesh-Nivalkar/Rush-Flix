/* global __APP_VERSION__ */

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2.2.0";

const GITHUB_ATOM_URL =
  "https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases.atom";

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
 * Fetch the latest GitHub release via Atom feed (no API rate limits).
 * Returns { latest, apkUrl, releaseNotes }.
 * Throws a human-readable Error on any failure.
 */
export async function fetchLatestRelease() {
  let res;
  try {
    res = await fetch(GITHUB_ATOM_URL, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error("Could not reach GitHub. Check internet connection.");
  }
  if (!res.ok)
    throw new Error(`GitHub returned status ${res.status}.`);

  let text;
  try { text = await res.text(); }
  catch { throw new Error("Invalid response from GitHub."); }

  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Invalid response from GitHub.");

  const firstEntry = doc.querySelector("entry");
  if (!firstEntry) throw new Error("No releases found on GitHub.");

  const titleText = firstEntry.querySelector("title")?.textContent?.trim() || "";
  const vMatch = titleText.match(/v?(\d+\.\d+\.\d+)/);
  if (!vMatch) throw new Error("No releases found on GitHub.");
  const latestClean = vMatch[1];
  const latest = `v${latestClean}`;

  const apkUrl = `https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases/download/${latest}/Rush-Flix_V${latestClean}.apk`;
  const ipkUrl = `https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases/download/${latest}/Rush-Flix_V${latestClean}.ipk`;

  const rawNotes = firstEntry.querySelector("content")?.textContent ||
                   firstEntry.querySelector("summary")?.textContent || "";
  const releaseNotes = new DOMParser().parseFromString(rawNotes, "text/html")
    .body?.textContent?.trim() || "";

  return { latest, apkUrl, ipkUrl, releaseNotes };
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
