const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

export const imgUrl = (path, size = "w500") =>
  path ? `${IMG_BASE}/${size}${path}` : null;

// Global auth-error callback, registered by App on mount
let _onAuthError = null;
let _onUnreachable = null;
export const setApiErrorHandlers = (onAuth, onUnreachable) => {
  _onAuthError = onAuth;
  _onUnreachable = onUnreachable;
};

// ── In-memory TMDB response cache (session-scoped, cleared on page reload) ───
// Avoids redundant network calls when navigating back to the same show.
// TTL: 5 minutes
const _tmdbCache = new Map(); // key → { data, expiresAt }
const TMDB_CACHE_TTL = 5 * 60 * 1000;

// ── Request queue (max 4 concurrent TMDB fetches) ────────────────────────────
// Prevents bursts of 10-20 parallel requests from carousel/similar-rows rapid
// navigation from hammering the API and triggering rate-limit responses.
let _inflight = 0;
const MAX_INFLIGHT = 4;
const _waiters = [];

function _acquireSlot() {
  if (_inflight < MAX_INFLIGHT) {
    _inflight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _waiters.push(resolve));
}

function _releaseSlot() {
  _inflight--;
  if (_waiters.length > 0) {
    _inflight++;
    _waiters.shift()();
  }
}

export const tmdbFetch = async (path, apiKey) => {
  const cacheKey = `${apiKey}|${path}`;
  const cached = _tmdbCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  await _acquireSlot();

  let res;
  try {
    res = await fetch(`${TMDB_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    _releaseSlot();
    _onUnreachable?.();
    throw new Error("TMDB unreachable");
  } finally {
    // releaseSlot is called in the catch above for network errors;
    // for successful responses it is called immediately below, before
    // parsing, so the slot is held only during the actual in-flight
    // request, not during res.json().
  }

  _releaseSlot();

  if (res.status === 401 || res.status === 403) {
    _onAuthError?.();
    throw new Error(`TMDB ${res.status}`);
  }

  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  _tmdbCache.set(cacheKey, { data, expiresAt: Date.now() + TMDB_CACHE_TTL });

  // Evict stale entries to prevent unbounded memory growth
  if (_tmdbCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of _tmdbCache) {
      if (now >= v.expiresAt) _tmdbCache.delete(k);
    }
  }

  return data;
};

// ── Player Sources ────────────────────────────────────────────────────────────

// Hardcoded defaults. getBase() reads the auto-saved override first at call-time.
const SOURCE_DEFAULTS = {
  videasy:  "https://player.videasy.to",
  vidsrc:   "https://vidsrc.to/embed",
  "2embed": "https://www.2embed.online/embed",
};

// Reads auto-saved redirect override from localStorage at call-time.
// Falls back to SOURCE_DEFAULTS. Never throws.
function getBase(id) {
  try {
    const overrides = JSON.parse(localStorage.getItem("rushflix_playerSourceOverrides") || "{}");
    const b = overrides[id];
    return (typeof b === "string" && b.trim()) ? b.trim().replace(/\/$/, "") : SOURCE_DEFAULTS[id];
  } catch {
    return SOURCE_DEFAULTS[id];
  }
}

// APK-only: probes the current effective base URL via Capacitor native HTTP (no CORS restriction).
// Follows the redirect chain. Returns the new origin if domain changed, else null.
// Probes current effective URL (override → default) to handle cascading domain changes.
// Browser: returns null immediately (isNativePlatform() === false).
export async function checkSourceRedirect(id) {
  try {
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const currentBase = getBase(id);
    const res = await CapacitorHttp.request({
      method: "GET",
      url: currentBase + "/",
      responseType: "text",
      connectTimeout: 6000,
      readTimeout: 6000,
    });
    if (!res?.url) return null;
    const finalOrigin = new URL(res.url).origin;
    if (finalOrigin === new URL(currentBase).origin) return null;
    return finalOrigin;
  } catch {
    return null;
  }
}

export const PLAYER_SOURCES = [
  {
    id: "videasy",
    label: "Videasy",
    tag: null,
    note: null,
    supportsProgress: false,
    movieUrl: (id) => `${getBase("videasy")}/movie/${id}`,
    tvUrl: (id, season, ep) => `${getBase("videasy")}/tv/${id}/${season}/${ep}`,
  },
  {
    id: "vidsrc",
    label: "VidSrc",
    tag: null,
    note: null,
    supportsProgress: false,
    movieUrl: (id) => `${getBase("vidsrc")}/movie/${id}`,
    tvUrl: (id, season, ep) => `${getBase("vidsrc")}/tv/${id}/${season}/${ep}`,
  },
  {
    id: "2embed",
    label: "2Embed",
    tag: null,
    note: "unstable",
    supportsProgress: false,
    movieUrl: (id) => `${getBase("2embed")}/movie/${id}`,
    tvUrl: (id, season, ep) => `${getBase("2embed")}/tv/${id}/${season}/${ep}`,
  },
];

export const getSourceUrl = (sourceId, type, id, season, ep) => {
  const src = PLAYER_SOURCES.find((s) => s.id === sourceId) ?? PLAYER_SOURCES[0];
  return type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, ep);
};

export const NON_ANIME_DEFAULT_SOURCE = "videasy";
export const ANIME_DEFAULT_SOURCE = "videasy";

// ── AniList API (anime metadata) ──────────────────────────────────────────────
const ANILIST_API = "https://graphql.anilist.co";

// Strip "(Source: ...)", "Note: ..." and similar attribution lines from AniList descriptions
export const cleanAnilistDescription = (desc) => {
  if (!desc) return desc;
  // Remove HTML by stripping all < and > characters and anything between them.
  // Splitting on < and dropping the tag portion of each chunk is immune to
  // unclosed/malformed tags and avoids any regex that starts with "<" (which
  // static analysers flag as potentially incomplete).
  let clean = desc
    .split("<")
    .map((chunk, i) => (i === 0 ? chunk : chunk.slice(chunk.indexOf(">") + 1)))
    .join("")
    .replace(/>/g, "");
  // Remove everything from "(Source:" onwards (including multi-line variants)
  clean = clean.replace(/\(Source:[^)]*\)/gi, "");
  // Remove "Note: ..." sentences/paragraphs at the end
  clean = clean.replace(/\bNote:[^\n]*/gi, "");
  // Remove trailing whitespace, newlines, punctuation left over
  clean = clean.replace(/[\s\n]+$/, "").trim();
  return clean;
};

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    genres
    averageScore
    episodes
    status
    season
    seasonYear
    studios(isMain: true) { nodes { name } }
    startDate { year month }
    relations {
      edges {
        relationType
        node {
          id
          type
          format
          title { romaji english }
          episodes
          startDate { year month }
          seasonYear
        }
      }
    }
  }
}`;

// ── AniList cache (localStorage + in-memory) ──────────────────────────────────
const ANILIST_CACHE_KEY = "rushflix_anilistCache";
const ANILIST_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

// loaded once on first use, flushed to localStorage on write.
let _anilistCache = null;

function getAnilistCache() {
  if (_anilistCache) return _anilistCache;
  try {
    const raw = localStorage.getItem(ANILIST_CACHE_KEY);
    _anilistCache = raw ? JSON.parse(raw) : {};
  } catch {
    _anilistCache = {};
  }
  // Evict stale entries once on load
  const now = Date.now();
  for (const key of Object.keys(_anilistCache)) {
    if (now - _anilistCache[key].ts > ANILIST_CACHE_TTL) {
      delete _anilistCache[key];
    }
  }
  return _anilistCache;
}

let _anilistFlushTimer = null;
function flushAnilistCache() {
  if (_anilistFlushTimer) clearTimeout(_anilistFlushTimer);
  _anilistFlushTimer = setTimeout(() => {
    _anilistFlushTimer = null;
    try {
      localStorage.setItem(ANILIST_CACHE_KEY, JSON.stringify(_anilistCache));
    } catch {}
  }, 500);
}

// tmdbId is used as the cache key (unique per show) while title is used for the AniList search query.
export const fetchAnilistData = async (
  title,
  type = "ANIME",
  tmdbId = null,
) => {
  const cacheKey = tmdbId
    ? `${type}__tmdb_${tmdbId}`
    : `${type}__${title.toLowerCase().trim()}`;

  const cache = getAnilistCache();
  const entry = cache[cacheKey];
  if (entry && Date.now() - entry.ts <= ANILIST_CACHE_TTL) {
    // Sanity-check: make sure cached data actually belongs to this title.
    const cachedTitles = [
      entry.data?.title?.romaji,
      entry.data?.title?.english,
      entry.data?.title?.native,
    ]
      .filter(Boolean)
      .map((t) => t.toLowerCase());
    const searchTitle = title.toLowerCase();
    const isMismatch =
      entry.data !== null &&
      cachedTitles.length > 0 &&
      !cachedTitles.some(
        (t) => t.includes(searchTitle) || searchTitle.includes(t),
      );
    if (!isMismatch) return entry.data;
    // Mismatch detected
    delete cache[cacheKey];
    flushAnilistCache();
  }

  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: title, type },
      }),
    });
    const json = await res.json();
    const data = json?.data?.Media || null;

    cache[cacheKey] = { data, ts: Date.now() };
    flushAnilistCache();

    return data;
  } catch {
    if (entry) return entry.data;
    return null;
  }
};

// TMDB genre ID 16 = Animation. We treat it as anime when origin_country includes JP or language is jp
export const isAnimeContent = (item, details) => {
  const d = details || item;
  const lang = d.original_language;
  const countries = d.origin_country || [];
  const genreIds = d.genre_ids || (d.genres || []).map((g) => g.id);
  const hasAnimation = genreIds.includes(16);
  return hasAnimation && (lang === "ja" || countries.includes("JP"));
};

