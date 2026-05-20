// Private JSON catalogue support.
// Users host a JSON file at any URL. Rush Flix fetches, validates, and caches it.
// Expected format (all fields except title are optional):
// [{ title, year, streamUrl, poster, type: "movie"|"tv", overview }]

const CACHE_PREFIX = "rushflix_jsonCat_";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function cacheKey(url) {
  return CACHE_PREFIX + btoa(url).replace(/[^a-z0-9]/gi, "").slice(0, 40);
}

export function getCatalogueMeta(url) {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return { lastScanned: null, count: 0, status: "stale" };
    const { ts, items } = JSON.parse(raw);
    return {
      lastScanned: ts,
      count: items?.length ?? 0,
      status: Date.now() - ts < CACHE_TTL ? "ok" : "stale",
    };
  } catch {
    return { lastScanned: null, count: 0, status: "stale" };
  }
}

export function clearCatalogueCache(url) {
  try { localStorage.removeItem(cacheKey(url)); } catch {}
}

export async function fetchJsonCatalogue(url) {
  const key = cacheKey(url);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { ts, items } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return items;
    }
  } catch {}

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Catalogue fetch failed: ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error("Catalogue must be a JSON array");

  const items = json
    .filter((entry) => entry && typeof entry.title === "string")
    .map((entry, i) => ({
      id: `jsoncat_${btoa(url).slice(0, 8)}_${i}`,
      title: entry.title,
      overview: entry.overview || "",
      media_type: entry.type === "tv" ? "tv" : "movie",
      isCustom: true,
      streamUrl: entry.streamUrl || "",
      poster_path: null,
      posterUrl: entry.poster || null,
      vote_average: 0,
      release_date: entry.year ? `${entry.year}-01-01` : "",
      year: entry.year ? String(entry.year) : "",
    }));

  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), items }));
  } catch {}
  return items;
}

export async function fetchAllCatalogues(urls) {
  const results = await Promise.allSettled(urls.map(fetchJsonCatalogue));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
