// All storage is localStorage-based (no Electron dependency).
// Profile-aware: keys are prefixed with rushflix_{profileId}_ for per-profile data,
// or rushflix_ for global app data.

const APP_PREFIX = "rushflix_";

// Global app storage (TMDB key, settings, trending cache, etc.)
export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(APP_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(APP_PREFIX + key);
    } catch {}
  },
  clearAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(APP_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
  },
};

// Per-profile storage — prefixed with rushflix_{profileId}_
export function profileStorage(profileId) {
  const prefix = `${APP_PREFIX}${profileId}_`;
  return {
    get(key) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {}
    },
    remove(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {}
    },
  };
}

export const STORAGE_KEYS = {
  API_KEY: "apikey",
  WATCH_PROGRESS: "progress",
  WATCHED: "watched",
  HISTORY: "history",
  SAVED: "saved",
  SAVED_ORDER: "savedOrder",
  START_PAGE: "startPage",
  AGE_LIMIT: "ageLimit",
  RATING_COUNTRY: "ratingCountry",
  WATCHED_THRESHOLD: "watchedThreshold",
  HOME_ROW_ORDER: "homeRowOrder",
  HOME_ROW_VISIBLE: "homeRowVisible",
  INVIDIOUS_BASE: "invidiousBase",
  SUBTITLE_ENABLED: "subtitleDownload",
  SUBTITLE_LANG: "subtitleLang",
  ACCENT_COLOR: "accentColor",
  FONT_SIZE: "fontSize",
  COMPACT_MODE: "compactMode",
  REDUCE_ANIMATIONS: "reduceAnimations",
  LIBRARY_SORT: "librarySort",
  HISTORY_ENABLED: "historyEnabled",
  INTRO_SKIP_MODE: "introSkipMode",
  INTRO_SKIP_DURATION: "introSkipDuration",
  SUBTITLE_SIZE: "subtitleSize",
  SUBTITLE_POSITION: "subtitlePosition",
  EPISODE_RELEASE_CACHE: "episodeReleaseCache",
  // TV-specific
  TV_NAV_SOUND: "tvNavSound",
  PLAYER_SOURCE: "playerSource",
  WATCH_TIMESTAMPS: "timestamps",
  CUSTOM_SOURCES: "customSources",
  PLAYER_SOURCE_OVERRIDES: "playerSourceOverrides",
  SERIES_NEXT: "seriesNext",
  // Multi-source content rows
  SHARED_LIBRARY: "sharedLibrary",
  PERSONAL_MEDIA: "personalMedia",
  FRIENDS_MEDIA: "friendsMedia",
  SOURCES_META: "sourcesMeta",
  JSON_CATALOGUES: "jsonCatalogues",
};

// Simple API key storage (no OS keychain, just localStorage)
export const secureStorage = {
  async get(key) {
    return storage.get(key) || null;
  },
  async set(key, value) {
    if (value) storage.set(key, value);
    else storage.remove(key);
  },
};

export function formatBytes(bytes) {
  if (bytes == null) return "…";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}

export async function clearAppCaches() {
  localStorage.removeItem("rushflix_anilistCache");
  localStorage.removeItem("rushflix_episodeGroupCache");
  localStorage.removeItem("rushflix_aniskipCache");
  localStorage.removeItem("rushflix_trendingCache");
}

export const isElectron = false;

export const getApiKey = () => storage.get(STORAGE_KEYS.API_KEY);

// Returns per-profile storage for the currently active profile.
// Falls back to global storage when no profile is active (guest / setup).
export function getCurrentPStore() {
  const id = localStorage.getItem("rushflix_activeProfile");
  return id ? profileStorage(id) : storage;
}
