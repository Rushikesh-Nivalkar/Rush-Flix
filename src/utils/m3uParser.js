const M3U_URL      = "https://iptv-org.github.io/iptv/index.m3u";
const COUNTRY_M3U  = (code) => `https://iptv-org.github.io/iptv/countries/${code.toLowerCase()}.m3u`;
const CACHE_TTL    = 6 * 60 * 60 * 1000; // 6h

let _channels = null, _fetchTime = 0, _fetchPromise = null;

const _countryChannels = {}, _countryFetchTimes = {}, _countryFetchPromises = {};

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
      meta = { name, logo, group, tvgId };
    } else if (line && !line.startsWith("#") && meta) {
      if (line.startsWith("http")) channels.push({ ...meta, url: line });
      meta = null;
    }
  }
  return channels;
}

export async function fetchChannels() {
  if (_channels && Date.now() - _fetchTime < CACHE_TTL) return _channels;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch(M3U_URL)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((text) => { _channels = parseM3U(text); _fetchTime = Date.now(); _fetchPromise = null; return _channels; })
    .catch((err) => { _fetchPromise = null; throw err; });
  return _fetchPromise;
}

export async function fetchChannelsByCountry(code) {
  const key = code.toLowerCase();
  if (_countryChannels[key] && Date.now() - (_countryFetchTimes[key] || 0) < CACHE_TTL) {
    return _countryChannels[key];
  }
  if (_countryFetchPromises[key]) return _countryFetchPromises[key];
  _countryFetchPromises[key] = fetch(COUNTRY_M3U(code))
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((text) => {
      _countryChannels[key] = parseM3U(text);
      _countryFetchTimes[key] = Date.now();
      delete _countryFetchPromises[key];
      return _countryChannels[key];
    })
    .catch((err) => { delete _countryFetchPromises[key]; throw err; });
  return _countryFetchPromises[key];
}
