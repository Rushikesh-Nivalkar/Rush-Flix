import {
  useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense,
} from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import TVNavBar from "./components/TVNavBar";
import SearchModal from "./components/SearchModal";
import SetupScreen from "./components/SetupScreen";
import ProfileSelectPage from "./pages/ProfileSelectPage";
import { storage, secureStorage, STORAGE_KEYS, profileStorage, clearAppCaches } from "./utils/storage";
import { applyAccentColor } from "./utils/appearance";
import { tmdbFetch, setApiErrorHandlers } from "./utils/api";
import { fetchAllCatalogues } from "./utils/jsonCatalogue";
import { getLanSyncConfig, pullSync, schedulePush } from "./utils/lanSync";
import { useTVNavigation } from "./utils/tvNav";
import {
  getProfiles, getActiveProfileId, setActiveProfileId, getActiveProfile,
} from "./utils/profiles";
import TVPlayer from "./components/TVPlayer";

const HomePage = lazy(() => import("./pages/HomePage"));
const MoviePage = lazy(() => import("./pages/MoviePage"));
const TVPage = lazy(() => import("./pages/TVPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));

export default function App() {
  // ── Profile state ─────────────────────────────────────────────────────────
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const pStore = useMemo(
    () => activeProfile ? profileStorage(activeProfile.id) : null,
    [activeProfile],
  );

  // ── API key ───────────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [skipped, setSkipped] = useState(() => !!storage.get("tmdbSkipped"));
  const [apiKeyStatus, setApiKeyStatus] = useState("checking");
  const [changingKey, setChangingKey] = useState(false);

  // ── Navigation ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(() => storage.get(STORAGE_KEYS.START_PAGE) || "home");
  const [selected, setSelected] = useState(null);
  const [navStack, setNavStack] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const pageRef = useRef(page);
  const selectedRef = useRef(selected);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPage(last.page);
      setSelected(last.selected);
      return prev.slice(0, -1);
    });
  }, []);

  const navigate = useCallback((pg, data = null) => {
    setNavStack((prev) => [
      ...prev,
      { page: pageRef.current, selected: selectedRef.current },
    ]);
    setSelected(data);
    setPage(pg);
    setShowSearch(false);
  }, []);

  // TV D-pad navigation — back button maps to navigateBack
  useTVNavigation({ onBack: navigateBack });

  // ── Per-profile data (watchlist, history, progress, watched) ──────────────
  const [saved, setSaved] = useState({});
  const [savedOrder, setSavedOrder] = useState(null);
  const [progress, setProgress] = useState({});
  const [timestamps, setTimestamps] = useState({});
  const [history, setHistory] = useState([]);
  const [watched, setWatched] = useState({});

  // Reload per-profile data when profile switches
  useEffect(() => {
    if (!pStore) return;
    setSaved(pStore.get("saved") || {});
    setSavedOrder(pStore.get("savedOrder") || null);
    setProgress(pStore.get(STORAGE_KEYS.WATCH_PROGRESS) || {});
    setTimestamps(pStore.get(STORAGE_KEYS.WATCH_TIMESTAMPS) || {});
    setHistory(pStore.get(STORAGE_KEYS.HISTORY) || []);
    setWatched(pStore.get(STORAGE_KEYS.WATCHED) || {});
  }, [pStore]);

  // ── Multi-source content rows (global — shared across all profiles) ───────
  const [sharedLibrary, setSharedLibraryState] = useState(
    () => storage.get(STORAGE_KEYS.SHARED_LIBRARY) || [],
  );
  const [personalMedia, setPersonalMediaState] = useState(
    () => storage.get(STORAGE_KEYS.PERSONAL_MEDIA) || [],
  );
  const [friendsMedia, setFriendsMediaState] = useState(
    () => storage.get(STORAGE_KEYS.FRIENDS_MEDIA) || [],
  );
  const [jsonCatalogueItems, setJsonCatalogueItems] = useState([]);

  // Load JSON catalogues on startup
  useEffect(() => {
    const urls = storage.get(STORAGE_KEYS.JSON_CATALOGUES) || [];
    if (!urls.length) return;
    fetchAllCatalogues(urls).then(setJsonCatalogueItems).catch(() => {});
  }, []);

  const updateSharedLibrary = useCallback((items) => {
    setSharedLibraryState(items);
    storage.set(STORAGE_KEYS.SHARED_LIBRARY, items);
  }, []);
  const updatePersonalMedia = useCallback((items) => {
    setPersonalMediaState(items);
    storage.set(STORAGE_KEYS.PERSONAL_MEDIA, items);
  }, []);
  const updateFriendsMedia = useCallback((items) => {
    setFriendsMediaState(items);
    storage.set(STORAGE_KEYS.FRIENDS_MEDIA, items);
  }, []);

  // ── Library sort — per-profile, re-reads when profile switches ───────────
  const [librarySort, setLibrarySort] = useState(
    () => (pStore ?? storage).get(STORAGE_KEYS.LIBRARY_SORT) || "manual",
  );
  useEffect(() => {
    setLibrarySort((pStore ?? storage).get(STORAGE_KEYS.LIBRARY_SORT) || "manual");
  }, [pStore]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Trending ──────────────────────────────────────────────────────────────
  const [trending, setTrending] = useState([]);
  const [trendingTV, setTrendingTV] = useState([]);
  const [loadingHome, setLoadingHome] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Load API key — env var wins over localStorage ─────────────────────────
  // Dev: set VITE_TMDB_TOKEN in .env.local → skips SetupScreen automatically.
  // Release: leave VITE_TMDB_TOKEN unset → SetupScreen appears for user entry.
  useEffect(() => {
    let mounted = true;
    const envToken = import.meta.env.VITE_TMDB_TOKEN;
    if (envToken) {
      if (mounted) { setApiKey(envToken); setApiKeyLoaded(true); }
      return () => { mounted = false; };
    }
    secureStorage.get(STORAGE_KEYS.API_KEY).then((val) => {
      if (!mounted) return;
      setApiKey(val || null);
      setApiKeyLoaded(true);
    });
    return () => { mounted = false; };
  }, []);

  // ── Register API error handlers ───────────────────────────────────────────
  useEffect(() => {
    setApiErrorHandlers(
      () => setApiKeyStatus("invalid_token"),
      () => setApiKeyStatus("unreachable"),
    );
  }, []);

  // ── Validate API key ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey) { setApiKeyStatus("ok"); return; }
    setApiKeyStatus("checking");
    const controller = new AbortController();
    fetch("https://api.themoviedb.org/3/configuration", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) setApiKeyStatus("invalid_token");
        else setApiKeyStatus("ok");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setApiKeyStatus("unreachable");
      });
    return () => controller.abort();
  }, [apiKey]);

  // ── Apply appearance on startup ───────────────────────────────────────────
  useEffect(() => {
    const accent = storage.get(STORAGE_KEYS.ACCENT_COLOR) || "red";
    applyAccentColor(accent);
    const noAnim = !!storage.get(STORAGE_KEYS.REDUCE_ANIMATIONS);
    document.body.classList.toggle("no-anim", noAnim);
  }, []);

  // ── Version update checker ────────────────────────────────────────────────
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    fetch("/version.json", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ version }) => {
        const seen = storage.get("appVersion");
        if (seen && seen !== version) setUpdateAvailable(true);
        if (!seen) storage.set("appVersion", version);
      })
      .catch(() => {});
  }, []);

  // ── Trending fetch (cached 30 min) ────────────────────────────────────────
  const fetchTrending = useCallback(() => {
    if (!apiKey) return;
    const cached = storage.get("trendingCache");
    const CACHE_TTL = 30 * 60 * 1000;
    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) {
      setTrending(cached.movies || []);
      setTrendingTV(cached.tv || []);
      return;
    }
    setLoadingHome(true);
    Promise.all([
      tmdbFetch("/trending/movie/week", apiKey),
      tmdbFetch("/trending/tv/week", apiKey),
    ])
      .then(([m, t]) => {
        const movies = m.results || [];
        const tv = t.results || [];
        setTrending(movies);
        setTrendingTV(tv);
        storage.set("trendingCache", { movies, tv, ts: Date.now() });
      })
      .catch(() => {})
      .finally(() => setLoadingHome(false));
  }, [apiKey]);

  useEffect(() => { fetchTrending(); }, [fetchTrending]);

  const retryHome = useCallback(() => {
    if (offline) return;
    fetchTrending();
  }, [offline, fetchTrending]);

  // ── New-episode check on startup ──────────────────────────────────────────
  useEffect(() => {
    if (!apiKeyLoaded || !apiKey || !pStore) return;
    const notifyPref = storage.get(STORAGE_KEYS.NOTIFY_NEW_EPISODE);
    if (notifyPref === false || notifyPref === 0) return;

    let cancelled = false;
    async function check() {
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;
      const tvSeries = Object.values(saved).filter((i) => i?.media_type === "tv");
      if (!tvSeries.length) return;
      const cache = storage.get(STORAGE_KEYS.EPISODE_RELEASE_CACHE) || {};
      const now = Date.now();
      const CACHE_TTL = 12 * 60 * 60 * 1000;
      const toCheck = tvSeries.filter((s) => !cache[s.id] || now - (cache[s.id].checkedAt || 0) > CACHE_TTL);
      if (!toCheck.length) return;
      for (const series of toCheck) {
        if (cancelled) return;
        try {
          const data = await tmdbFetch(`/tv/${series.id}`, apiKey);
          if (cancelled) return;
          const lastEp = data.last_episode_to_air;
          const lastDate = lastEp?.air_date || null;
          const prev = cache[series.id] || {};
          const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const parseDate = (d) => { if (!d) return null; const [y,m,day] = d.split("-").map(Number); return new Date(y,m-1,day); };
          const lastParsed = parseDate(lastDate);
          if (lastDate && lastDate !== prev.lastEpDate && lastParsed && lastParsed >= sevenDaysAgo) {
            // Web Notifications API (Android TV Chrome supports it)
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Rush Flix", { body: `New episode: ${series.title || series.name}` });
            }
          }
          cache[series.id] = { lastEpDate: lastDate, checkedAt: now };
        } catch {}
      }
      if (!cancelled) storage.set(STORAGE_KEYS.EPISODE_RELEASE_CACHE, cache);
    }
    check().catch(() => {});
    return () => { cancelled = true; };
  }, [apiKeyLoaded, apiKey, pStore, saved]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getMediaType = useCallback(
    (item) => item.media_type || (item.first_air_date ? "tv" : "movie"),
    [],
  );

  const handleSelectResult = useCallback((item) => {
    // Custom / archive items skip the TMDB detail page and go straight to player
    if (item.isCustom || item.isArchive) return navigate("player", item);
    navigate(item.media_type === "tv" ? "tv" : "movie", item);
  }, [navigate]);

  const saveApiKey = useCallback((key) => {
    secureStorage.set(STORAGE_KEYS.API_KEY, key);
    setApiKey(key);
    setChangingKey(false);
    setSkipped(false);
  }, []);

  const changeApiKey = useCallback(() => {
    setChangingKey(true);
  }, []);

  // ── Watchlist ─────────────────────────────────────────────────────────────
  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  const toggleSave = useCallback((item) => {
    if (!pStore) return;
    const mt = getMediaType(item);
    const id = `${mt}_${item.id}`;
    const currentSaved = savedRef.current;
    const isRemoving = !!currentSaved[id];
    const next = { ...currentSaved };
    if (isRemoving) {
      delete next[id];
      showToast("Removed from watchlist");
      setSavedOrder((prev) => {
        const order = (prev || Object.keys(currentSaved)).filter((k) => k !== id);
        pStore.set("savedOrder", order);
        return order;
      });
    } else {
      next[id] = {
        id: item.id, title: item.title || item.name,
        poster_path: item.poster_path, media_type: mt,
        vote_average: item.vote_average,
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        addedAt: Date.now(),
      };
      showToast("Added to watchlist");
      setSavedOrder((prev) => {
        const order = [...(prev || Object.keys(currentSaved)), id];
        pStore.set("savedOrder", order);
        return order;
      });
    }
    setSaved(next);
    pStore.set("saved", next);
  }, [showToast, getMediaType, pStore]);

  const isSaved = useCallback(
    (item) => !!saved[`${getMediaType(item)}_${item.id}`],
    [saved, getMediaType],
  );

  // ── History / progress ────────────────────────────────────────────────────
  const addHistory = useCallback((item) => {
    if (!pStore) return;
    const historyEnabled = (pStore ?? storage).get(STORAGE_KEYS.HISTORY_ENABLED);
    if (historyEnabled === 0 || historyEnabled === false) return;
    const entry = {
      id: item.id, title: item.title || item.name,
      poster_path: item.poster_path, media_type: getMediaType(item),
      watchedAt: Date.now(),
      season: item.season != null ? Number(item.season) : null,
      episode: item.episode != null ? Number(item.episode) : null,
      episodeName: item.episodeName || null,
    };
    setHistory((prev) => {
      const filtered = prev.filter((h) => !(h.id === entry.id && h.media_type === entry.media_type));
      const next = [entry, ...filtered].slice(0, 50);
      pStore.set(STORAGE_KEYS.HISTORY, next);
      return next;
    });
  }, [getMediaType, pStore]);

  const saveProgress = useCallback((key, pct) => {
    if (!pStore) return;
    setProgress((prev) => {
      if (prev[key] === pct) return prev;
      const next = { ...prev, [key]: pct };
      pStore.set(STORAGE_KEYS.WATCH_PROGRESS, next);
      return next;
    });
  }, [pStore]);

  const saveTimestamp = useCallback((key, t) => {
    if (!pStore) return;
    setTimestamps((prev) => {
      const rounded = Math.floor(t);
      if (prev[key] === rounded) return prev;
      const next = { ...prev, [key]: rounded };
      pStore.set(STORAGE_KEYS.WATCH_TIMESTAMPS, next);
      return next;
    });
  }, [pStore]);

  const markWatched = useCallback((key) => {
    if (!pStore) return;
    setWatched((prev) => { const next = { ...prev, [key]: true }; pStore.set(STORAGE_KEYS.WATCHED, next); return next; });
  }, [pStore]);

  const markUnwatched = useCallback((key) => {
    if (!pStore) return;
    setWatched((prev) => { const next = { ...prev }; delete next[key]; pStore.set(STORAGE_KEYS.WATCHED, next); return next; });
  }, [pStore]);

  // ── LAN sync ─────────────────────────────────────────────────────────────
  const [lanSyncStatus, setLanSyncStatus] = useState(null); // null | "ok" | "error"

  // Pull on startup
  useEffect(() => {
    const cfg = getLanSyncConfig();
    if (!cfg.enabled || !cfg.url || !pStore) return;
    pullSync(cfg.url)
      .then((data) => {
        if (data.saved)    { setSaved(data.saved);    pStore.set("saved", data.saved); }
        if (data.progress) { setProgress(data.progress); pStore.set(STORAGE_KEYS.WATCH_PROGRESS, data.progress); }
        if (data.watched)  { setWatched(data.watched);  pStore.set(STORAGE_KEYS.WATCHED, data.watched); }
        setLanSyncStatus("ok");
      })
      .catch(() => setLanSyncStatus("error"));
  }, [pStore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedule push whenever synced state changes
  useEffect(() => {
    const cfg = getLanSyncConfig();
    if (!cfg.enabled || !cfg.url) return;
    schedulePush(cfg.url, saved, progress, watched, () => setLanSyncStatus("error"));
  }, [saved, progress, watched]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const historyWithKeys = useMemo(() =>
    history
      .filter((h) => !(h.media_type === "tv" && (h.season == null || h.episode == null)))
      .map((h) => ({
        ...h,
        _pk: h.media_type === "movie"
          ? `movie_${h.id}`
          : `tv_${h.id}_s${h.season}e${h.episode}`,
      })),
    [history],
  );

  const inProgress = useMemo(() =>
    historyWithKeys.filter((h) => {
      if (watched[h._pk]) return false;
      const pct = progress[h._pk];
      return pct != null && pct > 2 && pct < 98;
    }),
    [historyWithKeys, progress, watched],
  );

  const savedList = useMemo(() => {
    const orderedKeys = savedOrder
      ? savedOrder.filter((k) => saved[k])
      : Object.keys(saved);
    const list = orderedKeys.map((k) => saved[k]).filter(Boolean);
    if (librarySort === "title") return [...list].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (librarySort === "rating") return [...list].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    if (librarySort === "year") return [...list].sort((a, b) => (b.year || "").localeCompare(a.year || ""));
    return list;
  }, [saved, savedOrder, librarySort]);

  const handleReorderSaved = useCallback((newOrder) => {
    setSavedOrder(newOrder);
    pStore?.set("savedOrder", newOrder);
  }, [pStore]);

  // ── Profile selection ─────────────────────────────────────────────────────
  function handleSelectProfile(profile) {
    // Clear guest data when leaving a guest session
    if (activeProfile?.isGuest) {
      const guestPrefix = "rushflix_guest_";
      Object.keys(localStorage)
        .filter((k) => k.startsWith(guestPrefix))
        .forEach((k) => localStorage.removeItem(k));
    }
    if (profile.isGuest) {
      // Guest: don't persist active profile — session only
      setActiveProfile({ id: "guest", name: "Guest", avatar: "👤", isGuest: true });
    } else {
      setActiveProfileId(profile.id);
      setActiveProfile(profile);
    }
  }

  // Show profile selector if no active profile, or if navigating to "profiles"
  if (!activeProfile || page === "profiles") {
    return (
      <ErrorBoundary>
        <ProfileSelectPage onSelectProfile={handleSelectProfile} />
      </ErrorBoundary>
    );
  }

  // Show TMDB setup screen if no API key, not skipped, or user is changing key
  if (!apiKeyLoaded) return null;
  if ((!apiKey && !skipped) || changingKey) {
    return (
      <SetupScreen
        onSave={saveApiKey}
        onSkip={changingKey
          ? () => setChangingKey(false)
          : () => { storage.set("tmdbSkipped", true); setSkipped(true); }}
        skipLabel={changingKey ? "Cancel" : undefined}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div className="tv-app">
        <TVNavBar
          page={page}
          onNavigate={navigate}
          onSearch={() => setShowSearch(true)}
          activeProfile={activeProfile}
        />

        <div className="tv-main main lrud-container">
          {/* API key status banners */}
          {apiKeyStatus === "invalid_token" && (
            <div className="api-status-banner api-status-error">
              <span>⚠ TMDB token invalid. Movies and shows won&apos;t load.</span>
              <button className="api-status-btn tv-focusable" tabIndex={0} onClick={changeApiKey}>
                Update Token
              </button>
            </div>
          )}
          {apiKeyStatus === "unreachable" && (
            <div className="api-status-banner api-status-warn">
              <span>⚠ Cannot reach TMDB. Check internet connection.</span>
              <button className="api-status-btn tv-focusable" tabIndex={0} onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          <Suspense fallback={<div className="tv-loading"><div className="spinner" /></div>}>
            {page === "home" && (
              <HomePage
                trending={trending}
                trendingTV={trendingTV}
                loading={loadingHome}
                onSelect={handleSelectResult}
                progress={progress}
                inProgress={inProgress}
                offline={offline}
                onRetry={retryHome}
                watched={watched}
                onMarkWatched={markWatched}
                onMarkUnwatched={markUnwatched}
                history={history}
                apiKey={apiKey}
                savedList={savedList}
                sharedLibrary={sharedLibrary}
                personalMedia={personalMedia}
                friendsMedia={friendsMedia}
                jsonCatalogueItems={jsonCatalogueItems}
              />
            )}
            {page === "movie" && selected && (
              <MoviePage
                item={selected}
                apiKey={apiKey}
                onSave={() => toggleSave(selected)}
                isSaved={isSaved(selected)}
                onHistory={addHistory}
                progress={progress}
                saveProgress={saveProgress}
                timestamps={timestamps}
                saveTimestamp={saveTimestamp}
                onBack={navigateBack}
                onSettings={(section) => navigate("settings", { section: section || null })}
                watched={watched}
                onMarkWatched={markWatched}
                onMarkUnwatched={markUnwatched}
                onSelect={handleSelectResult}
              />
            )}
            {page === "tv" && selected && (
              <TVPage
                item={selected}
                apiKey={apiKey}
                onSave={() => toggleSave(selected)}
                isSaved={isSaved(selected)}
                onHistory={addHistory}
                progress={progress}
                saveProgress={saveProgress}
                timestamps={timestamps}
                saveTimestamp={saveTimestamp}
                onBack={navigateBack}
                onSettings={(section) => navigate("settings", { section: section || null })}
                watched={watched}
                onMarkWatched={markWatched}
                onMarkUnwatched={markUnwatched}
                offline={offline}
              />
            )}
            {page === "history" && (
              <LibraryPage
                history={history}
                inProgress={inProgress}
                saved={savedList}
                progress={progress}
                onSelect={handleSelectResult}
                watched={watched}
                onMarkWatched={markWatched}
                onMarkUnwatched={markUnwatched}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                apiKey={apiKey}
                onChangeApiKey={changeApiKey}
                initialSection={selected?.section}
              />
            )}
            {page === "sources" && (
              <SourcesPage
                savedList={savedList}
                sharedLibrary={sharedLibrary}
                onUpdateSharedLibrary={updateSharedLibrary}
                personalMedia={personalMedia}
                onUpdatePersonalMedia={updatePersonalMedia}
                friendsMedia={friendsMedia}
                onUpdateFriendsMedia={updateFriendsMedia}
                activeProfile={activeProfile}
                onRefreshPublicDomain={fetchTrending}
              />
            )}
            {page === "player" && selected && (
              <TVPlayer
                title={selected.title || selected.name || ""}
                progressKey={`custom_${selected.id}`}
                initialProgress={progress[`custom_${selected.id}`] || 0}
                onProgress={(pct) => saveProgress(`custom_${selected.id}`, pct)}
                onClose={navigateBack}
                prefilledUrl={selected.streamUrl || ""}
              />
            )}
          </Suspense>
        </div>

        {showSearch && (
          <SearchModal
            apiKey={apiKey}
            onSelect={handleSelectResult}
            onClose={() => setShowSearch(false)}
            offline={offline}
            personalMedia={personalMedia}
            friendsMedia={friendsMedia}
          />
        )}

        {toast && <div className="toast">{toast}</div>}

        {updateAvailable && (
          <div className="update-banner">
            New version available — reload to apply.
            <button
              className="update-banner-dismiss"
              onClick={() => {
                fetch("/version.json", { cache: "no-store" })
                  .then((r) => r.json())
                  .then(({ version }) => storage.set("appVersion", version))
                  .catch(() => {});
                setUpdateAvailable(false);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
