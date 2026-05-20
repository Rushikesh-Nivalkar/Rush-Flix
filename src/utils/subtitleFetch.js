// Subtitle fetching via SubDL and Wyzie APIs.
// Returns a blob URL pointing to a VTT file, suitable for <track src=...>.
// Session-only cache (Map) — subtitle text is large, not stored in localStorage.

const sessionCache = new Map(); // key → blob URL

function srtToVtt(srt) {
  return (
    "WEBVTT\n\n" +
    srt
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // SRT timestamps use comma for ms separator; VTT uses period
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
  );
}

function makeBlobUrl(text, isVtt) {
  const vtt = isVtt ? text : srtToVtt(text);
  const blob = new Blob([vtt], { type: "text/vtt" });
  return URL.createObjectURL(blob);
}

async function trySubDL(tmdbId, mediaType, season, episode, lang) {
  // SubDL requires a season/episode for TV
  const params = new URLSearchParams({
    tmdb_id: tmdbId,
    language: lang,
    ...(mediaType === "tv" && season != null
      ? { season_number: season, episode_number: episode }
      : {}),
  });
  const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const sub = data.subtitles?.[0];
  if (!sub?.url) return null;

  // Download the actual subtitle file
  const fileRes = await fetch(sub.url, { signal: AbortSignal.timeout(8000) });
  if (!fileRes.ok) return null;
  const text = await fileRes.text();
  const isVtt = sub.url.endsWith(".vtt");
  return makeBlobUrl(text, isVtt);
}

async function tryWyzie(tmdbId, mediaType, season, episode, lang) {
  const params = new URLSearchParams({
    tmdb_id: tmdbId,
    lang,
    ...(mediaType === "tv" && season != null
      ? { season, episode }
      : {}),
  });
  const res = await fetch(`https://sub.wyzie.ru/search?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  const sub = data[0];
  if (!sub?.url) return null;

  const fileRes = await fetch(sub.url, { signal: AbortSignal.timeout(8000) });
  if (!fileRes.ok) return null;
  const text = await fileRes.text();
  const isVtt = sub.url.endsWith(".vtt");
  return makeBlobUrl(text, isVtt);
}

/**
 * Fetch a subtitle blob URL. Tries SubDL first, falls back to Wyzie.
 * Returns null if nothing found.
 */
export async function fetchSubtitleUrl(tmdbId, mediaType, season, episode, lang = "en") {
  if (!tmdbId) return null;
  const key = `${tmdbId}_${mediaType}_${season}_${episode}_${lang}`;
  if (sessionCache.has(key)) return sessionCache.get(key);

  let url = null;
  try { url = await trySubDL(tmdbId, mediaType, season, episode, lang); } catch {}
  if (!url) {
    try { url = await tryWyzie(tmdbId, mediaType, season, episode, lang); } catch {}
  }

  if (url) sessionCache.set(key, url);
  return url;
}

/** Release blob URL memory when player unmounts */
export function revokeSubtitleUrl(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
