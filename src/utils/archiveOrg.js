// Fetches public-domain feature films from the Internet Archive.
// Results are cached in localStorage for 24 hours.
// All content is legally free to stream — no copyright issues.

const CACHE_KEY = "rushflix_publicDomainCache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

export function clearPublicDomainCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

export function getPublicDomainMeta() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { lastScanned: null, count: 0, status: "stale" };
    const { ts, items } = JSON.parse(raw);
    const age = Date.now() - ts;
    return {
      lastScanned: ts,
      count: items?.length ?? 0,
      status: age < CACHE_TTL ? "ok" : "stale",
    };
  } catch {
    return { lastScanned: null, count: 0, status: "stale" };
  }
}

export async function fetchPublicDomainMovies() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { ts, items } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return items;
    }
  } catch {}

  const params = new URLSearchParams({
    q: "mediatype:movies subject:feature_film",
    fl: "identifier,title,year,description",
    rows: "24",
    sort: "downloads desc",
    output: "json",
  });

  const res = await fetch(
    `https://archive.org/advancedsearch.php?${params}`,
  );
  if (!res.ok) throw new Error("archive.org fetch failed");
  const data = await res.json();

  const items = (data.response?.docs || []).map((doc) => ({
    id: `archive_${doc.identifier}`,
    title: doc.title || doc.identifier,
    overview: Array.isArray(doc.description)
      ? doc.description[0]
      : doc.description || "",
    media_type: "movie",
    isArchive: true,
    archiveId: doc.identifier,
    // archive.org embed player always works regardless of file format
    streamUrl: `https://archive.org/embed/${doc.identifier}`,
    poster_path: null,
    vote_average: 0,
    release_date: doc.year ? `${doc.year}-01-01` : "",
  }));

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch {}
  return items;
}
