const M3U_URL      = "https://iptv-org.github.io/iptv/index.m3u";
const COUNTRY_M3U  = (code) => `https://iptv-org.github.io/iptv/countries/${code.toLowerCase()}.m3u`;
const CATEGORY_M3U = (id)   => `https://iptv-org.github.io/iptv/categories/${id.toLowerCase()}.m3u`;
const LANGUAGE_M3U = (code) => `https://iptv-org.github.io/iptv/languages/${code.toLowerCase()}.m3u`;

const CATEGORIES_API = "https://iptv-org.github.io/api/categories.json";
const LANGUAGES_API  = "https://iptv-org.github.io/api/languages.json";
const CHANNELS_API   = "https://iptv-org.github.io/api/channels.json";
const GUIDES_API     = "https://iptv-org.github.io/api/guides.json";

const CACHE_TTL = 6 * 60 * 60 * 1000;  // 6h — M3U playlists
const META_TTL  = 24 * 60 * 60 * 1000; // 24h — slowly-changing JSON metadata

// ── In-memory caches ──────────────────────────────────────────────────────────
let _channels = null, _fetchTime = 0, _fetchPromise = null;

const _countryChannels = {}, _countryFetchTimes = {}, _countryFetchPromises = {};
const _catChannels     = {}, _catTimes     = {}, _catPromises     = {};
const _langChannels    = {}, _langTimes    = {}, _langPromises    = {};

let _categories = null, _categoriesTime = 0, _categoriesPromise = null;
let _languages  = null, _languagesTime  = 0, _languagesPromise  = null;
let _channelsMeta = null, _channelsMetaTime = 0, _channelsMetaPromise = null;
let _guides = null, _guidesTime = 0, _guidesPromise = null;

// ── M3U parser ────────────────────────────────────────────────────────────────
export function parseM3U(text) {
  const lines = text.split("\n");
  const channels = [];
  let meta = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const name  = (line.match(/,(.+)$/)               || [])[1]?.trim() || "Unknown";
      const logo  = (line.match(/tvg-logo="([^"]+)"/)   || [])[1]         || null;
      const group = (line.match(/group-title="([^"]+)"/) || [])[1]?.trim() || "Uncategorized";
      const tvgId = (line.match(/tvg-id="([^"]+)"/)     || [])[1]         || null;
      const language = (line.match(/tvg-language="([^"]+)"/) || [])[1]?.trim() || "";
      const country  = (line.match(/tvg-country="([^"]+)"/)  || [])[1]?.trim() || "";
      meta = { name, logo, group, tvgId, language, country };
    } else if (line && !line.startsWith("#") && meta) {
      if (line.startsWith("http")) channels.push({ ...meta, url: line });
      meta = null;
    }
  }
  return channels;
}

// ── Generic M3U fetcher (shared pattern) ─────────────────────────────────────
function makeMFetcher(cache, times, promises, urlFn) {
  return async function fetchByKey(key) {
    const k = key.toLowerCase();
    if (cache[k] && Date.now() - (times[k] || 0) < CACHE_TTL) return cache[k];
    if (promises[k]) return promises[k];
    promises[k] = fetch(urlFn(k))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((text) => { cache[k] = parseM3U(text); times[k] = Date.now(); delete promises[k]; return cache[k]; })
      .catch((err) => { delete promises[k]; throw err; });
    return promises[k];
  };
}

// ── M3U playlist fetchers ─────────────────────────────────────────────────────
export async function fetchChannels() {
  if (_channels && Date.now() - _fetchTime < CACHE_TTL) return _channels;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch(M3U_URL)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((text) => { _channels = parseM3U(text); _fetchTime = Date.now(); _fetchPromise = null; return _channels; })
    .catch((err) => { _fetchPromise = null; throw err; });
  return _fetchPromise;
}

export const fetchChannelsByCountry  = makeMFetcher(_countryChannels, _countryFetchTimes, _countryFetchPromises, COUNTRY_M3U);
export const fetchChannelsByCategory = makeMFetcher(_catChannels,     _catTimes,          _catPromises,          CATEGORY_M3U);
export const fetchChannelsByLanguage = makeMFetcher(_langChannels,    _langTimes,         _langPromises,         LANGUAGE_M3U);

// ── JSON metadata fetchers ────────────────────────────────────────────────────
function makeJsonFetcher(getRef, setRef, getTime, setTime, getPromise, setPromise, url) {
  return async function () {
    if (getRef() && Date.now() - getTime() < META_TTL) return getRef();
    if (getPromise()) return getPromise();
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setRef(data); setTime(Date.now()); setPromise(null); return data; })
      .catch((err) => { setPromise(null); throw err; });
    setPromise(p);
    return p;
  };
}

export async function fetchCategoriesJson() {
  if (_categories && Date.now() - _categoriesTime < META_TTL) return _categories;
  if (_categoriesPromise) return _categoriesPromise;
  _categoriesPromise = fetch(CATEGORIES_API)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => { _categories = data; _categoriesTime = Date.now(); _categoriesPromise = null; return _categories; })
    .catch((err) => { _categoriesPromise = null; throw err; });
  return _categoriesPromise;
}

export async function fetchLanguagesJson() {
  if (_languages && Date.now() - _languagesTime < META_TTL) return _languages;
  if (_languagesPromise) return _languagesPromise;
  _languagesPromise = fetch(LANGUAGES_API)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => { _languages = data; _languagesTime = Date.now(); _languagesPromise = null; return _languages; })
    .catch((err) => { _languagesPromise = null; throw err; });
  return _languagesPromise;
}

// channels.json → Map<tvgId, {is_nsfw, logo, ...}> for enrichment
export async function fetchChannelsMeta() {
  if (_channelsMeta && Date.now() - _channelsMetaTime < META_TTL) return _channelsMeta;
  if (_channelsMetaPromise) return _channelsMetaPromise;
  _channelsMetaPromise = fetch(CHANNELS_API)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => {
      const map = new Map(data.map((c) => [c.id, c]));
      _channelsMeta = map; _channelsMetaTime = Date.now(); _channelsMetaPromise = null;
      return _channelsMeta;
    })
    .catch((err) => { _channelsMetaPromise = null; throw err; });
  return _channelsMetaPromise;
}

// guides.json → Map<channelId, guideEntry> for EPG availability detection
export async function fetchGuidesJson() {
  if (_guides && Date.now() - _guidesTime < META_TTL) return _guides;
  if (_guidesPromise) return _guidesPromise;
  _guidesPromise = fetch(GUIDES_API)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => {
      const map = new Map();
      for (const g of data) {
        if (!map.has(g.channel)) map.set(g.channel, g);
      }
      _guides = map; _guidesTime = Date.now(); _guidesPromise = null;
      return _guides;
    })
    .catch((err) => { _guidesPromise = null; throw err; });
  return _guidesPromise;
}

// ── Enrichment ────────────────────────────────────────────────────────────────
// Merges channels.json metadata (NSFW flag, logo fallback) into M3U channel list
export function enrichChannels(channels, metaMap) {
  if (!metaMap) return channels;
  return channels.map((ch) => {
    const meta = ch.tvgId ? metaMap.get(ch.tvgId) : null;
    if (!meta) return ch;
    return {
      ...ch,
      isNsfw: meta.is_nsfw || false,
      logo: ch.logo || meta.logo || null,
    };
  });
}
