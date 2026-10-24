const M3U_URL      = "https://iptv-org.github.io/iptv/index.m3u";
const COUNTRY_M3U  = (code) => `https://iptv-org.github.io/iptv/countries/${code.toLowerCase()}.m3u`;

const CHANNELS_API   = "https://iptv-org.github.io/api/channels.json";
const GUIDES_API     = "https://iptv-org.github.io/api/guides.json";

const CACHE_TTL = 6 * 60 * 60 * 1000;  // 6h — M3U playlists
const META_TTL  = 24 * 60 * 60 * 1000; // 24h — slowly-changing JSON metadata

// ── In-memory caches ──────────────────────────────────────────────────────────
let _channels = null, _fetchTime = 0, _fetchPromise = null;

const _countryChannels = {}, _countryFetchTimes = {}, _countryFetchPromises = {};

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

// ── JSON metadata fetchers ────────────────────────────────────────────────────
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
export function enrichChannels(channels, metaMap) {
  if (!metaMap) return channels;
  return channels.map((ch) => {
    const meta = ch.tvgId ? metaMap.get(ch.tvgId) : null;
    if (!meta) return ch;
    return {
      ...ch,
      isNsfw: meta.is_nsfw || false,
      logo:   ch.logo || meta.logo || null,
    };
  });
}
