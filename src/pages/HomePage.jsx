import { useState, useEffect, useMemo, useCallback } from "react";
import MediaCard from "../components/MediaCard";
import TrendingCarousel from "../components/TrendingCarousel";
import { PlayIcon, StarIcon, FilmIcon } from "../components/Icons";
import { imgUrl, tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { loadHomeLayout, loadHomeViewMode } from "../utils/homeLayout";
import { fetchPublicDomainMovies } from "../utils/archiveOrg";

// TMDB genre IDs used for genre rows
const GENRE_IDS = { genreAction: 28, genreDrama: 18, genreComedy: 35 };

function getRecentHistoryItem(history) {
  if (!history || history.length === 0) return null;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => h.watchedAt && h.watchedAt > sevenDaysAgo);
  if (recent.length === 0) return null;
  return recent[Math.floor(Math.random() * recent.length)];
}

export default function HomePage({
  trending,
  trendingTV,
  loading,
  onSelect,
  progress,
  inProgress,
  offline,
  onRetry,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  history,
  apiKey,
  savedList = [],
  sharedLibrary = [],
  personalMedia = [],
  friendsMedia = [],
  jsonCatalogueItems = [],
}) {
  const hero = trending[0];

  const [similarItems, setSimilarItems] = useState([]);
  const [similarSource, setSimilarSource] = useState(null);
  const [topRatedItems, setTopRatedItems] = useState([]);
  const [publicDomainItems, setPublicDomainItems] = useState([]);
  const [genreItems, setGenreItems] = useState({
    genreAction: [], genreDrama: [], genreComedy: [],
  });

  const [layout] = useState(() => loadHomeLayout());
  const { order: rowOrder, visible: rowVisible } = layout;
  const [viewMode] = useState(() => loadHomeViewMode());

  // ── Rating helpers ────────────────────────────────────────────────────────
  const allItems = useMemo(() => [
    ...inProgress,
    ...trending.map((i) => ({ ...i, media_type: "movie" })),
    ...trendingTV.map((i) => ({ ...i, media_type: "tv" })),
    ...similarItems,
    ...topRatedItems,
    ...savedList,
    ...(sharedLibrary || []),
  ], [inProgress, trending, trendingTV, similarItems, topRatedItems, savedList, sharedLibrary]);

  const { ratingsMap, ageLimitSetting } = useRatings(allItems);
  const getRating = useCallback((item) => getRatingForItem(item, ratingsMap), [ratingsMap]);
  const itemRestricted = useCallback(
    (item) => isRestricted(getRatingForItem(item, ratingsMap).minAge, ageLimitSetting),
    [ratingsMap, ageLimitSetting],
  );
  const enrichedRatingsMap = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(ratingsMap)) {
      out[k] = { ...v, restricted: isRestricted(v.minAge, ageLimitSetting) };
    }
    return out;
  }, [ratingsMap, ageLimitSetting]);

  // ── Recently Added (last 10 items added to watchlist) ────────────────────
  const recentlyAdded = useMemo(() =>
    [...savedList]
      .filter((i) => i.addedAt)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 10),
    [savedList],
  );

  // ── Stable card arrays ────────────────────────────────────────────────────
  const trendingMovieItems = useMemo(
    () => trending.slice(0, 10).map((i) => ({ ...i, media_type: "movie" })),
    [trending],
  );
  const trendingTVItems = useMemo(
    () => trendingTV.slice(0, 10).map((i) => ({ ...i, media_type: "tv" })),
    [trendingTV],
  );

  // ── Fetch: similar ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || offline || !history || history.length === 0) return;
    const source = getRecentHistoryItem(history);
    if (!source) return;
    setSimilarSource(source);
    const type = source.media_type === "tv" ? "tv" : "movie";
    const tryFetch = (ep) =>
      tmdbFetch(`/${type}/${source.id}/${ep}`, apiKey).then((d) =>
        (d.results || []).slice(0, 10).map((item) => ({ ...item, media_type: type })),
      );
    tryFetch("similar")
      .then((r) => { if (r.length > 0) { setSimilarItems(r); return; } return tryFetch("recommendations").then(setSimilarItems); })
      .catch(() => tryFetch("recommendations").then(setSimilarItems).catch(() => {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline, history?.length]);

  // ── Fetch: top rated ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || offline) return;
    const ctrl = new AbortController();
    Promise.all([
      tmdbFetch("/movie/top_rated?page=1", apiKey, { signal: ctrl.signal }),
      tmdbFetch("/tv/top_rated?page=1", apiKey, { signal: ctrl.signal }),
    ]).then(([m, t]) => {
      const movies = (m.results || []).slice(0, 8).map((i) => ({ ...i, media_type: "movie" }));
      const tv = (t.results || []).slice(0, 8).map((i) => ({ ...i, media_type: "tv" }));
      const merged = [];
      for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
        if (movies[i]) merged.push(movies[i]);
        if (tv[i]) merged.push(tv[i]);
      }
      setTopRatedItems(merged);
    }).catch((e) => { if (e.name !== "AbortError") console.warn(e); });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // ── Fetch: public domain (archive.org) ───────────────────────────────────
  useEffect(() => {
    if (offline) return;
    fetchPublicDomainMovies().then(setPublicDomainItems).catch(() => {});
  }, [offline]);

  // ── Fetch: genre rows ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || offline) return;
    const ctrl = new AbortController();
    Promise.all(
      Object.entries(GENRE_IDS).map(([rowId, genreId]) =>
        tmdbFetch(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&page=1`, apiKey, { signal: ctrl.signal })
          .then((d) => [rowId, (d.results || []).slice(0, 12).map((i) => ({ ...i, media_type: "movie" }))])
          .catch(() => [rowId, []]),
      ),
    ).then((results) => {
      const next = {};
      results.forEach(([id, items]) => { next[id] = items; });
      setGenreItems(next);
    });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // ── Row renderers ─────────────────────────────────────────────────────────
  const renderCardRow = (key, title, items, opts = {}) => {
    if (!items || items.length === 0) return null;
    return (
      <div key={key} className="section">
        <div className="section-title">
          {opts.badge && <span className="row-badge">{opts.badge}</span>}
          {title}
        </div>
        <div className="cards-row">
          {items.map((item) => {
            const type = item.media_type === "tv" ? "tv" : "movie";
            const rk = `${type}_${item.id}`;
            const rd = enrichedRatingsMap[rk] || {};
            return (
              <MediaCard
                key={`${item.media_type}_${item.id}`}
                item={item}
                onClick={() => onSelect(item)}
                progress={0}
                watched={watched}
                onMarkWatched={onMarkWatched}
                onMarkUnwatched={onMarkUnwatched}
                ageRating={rd.cert}
                restricted={rd.restricted}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const renderCarouselOrList = (key, title, titleHighlight, items) => {
    if (!items || items.length === 0) return null;
    if (viewMode === "list") {
      return (
        <div key={key} className="section">
          <div className="section-title">
            {title}{titleHighlight && <> &nbsp;<span style={{ color: "var(--red)" }}>{titleHighlight}</span></>}
          </div>
          <div className="cards-row">
            {items.map((item) => {
              const type = item.media_type === "tv" ? "tv" : "movie";
              const rd = enrichedRatingsMap[`${type}_${item.id}`] || {};
              return (
                <MediaCard
                  key={`${item.media_type}_${item.id}`}
                  item={item}
                  onClick={() => onSelect(item)}
                  progress={0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                  ageRating={rd.cert}
                  restricted={rd.restricted}
                />
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <TrendingCarousel
        key={key}
        items={items}
        title={title}
        titleHighlight={titleHighlight}
        onSelect={onSelect}
        ratingsMap={enrichedRatingsMap}
      />
    );
  };

  // Custom-content card (no TMDB poster — personal media / archive)
  const renderCustomCard = (item) => (
    <button
      key={item.id}
      className="custom-card tv-focusable"
      tabIndex={0}
      onClick={() => onSelect(item)}
    >
      <div className="custom-card-thumb">
        {item.poster_path
          ? <img src={imgUrl(item.poster_path, "w342")} alt={item.title} />
          : <div className="custom-card-placeholder"><FilmIcon /></div>}
      </div>
      <div className="custom-card-info">
        <div className="custom-card-title">{item.title || item.name}</div>
        {item.release_date && <div className="custom-card-year">{item.release_date.slice(0, 4)}</div>}
      </div>
    </button>
  );

  return (
    <div className="fade-in">
      {/* ── Offline ── */}
      {offline && (
        <div className="tv-offline">
          <div style={{ fontSize: 48 }}>📡</div>
          <div className="tv-offline-title">No internet connection</div>
          <div className="tv-offline-sub">Trending and search require internet. Library still works offline.</div>
          <button className="tv-btn tv-btn-primary tv-focusable mt-lg" tabIndex={0} onClick={onRetry}>Retry</button>
        </div>
      )}

      {!offline && loading && <div className="tv-loading"><div className="spinner" /></div>}

      {/* ── Hero banner ── */}
      {!loading && hero && (
        <div className="hero">
          <div className="hero-bg" style={{ backgroundImage: `url(${imgUrl(hero.backdrop_path, "original")})` }} />
          <div className="hero-gradient" />
          <div className="hero-content">
            <div className="hero-type">Trending · Movie</div>
            <div className="hero-title">{hero.title || hero.name}</div>
            <div className="hero-meta">
              <span className="hero-rating"><StarIcon /> {hero.vote_average?.toFixed(1)}</span>
              <span>{hero.release_date?.slice(0, 4)}</span>
            </div>
            <div className="hero-overview">{hero.overview}</div>
            <div className="hero-actions">
              <button
                className="btn btn-primary tv-focusable"
                tabIndex={0}
                onClick={() => onSelect({ ...hero, media_type: "movie" })}
              >
                <PlayIcon /> Watch Now
              </button>
              <button
                className="btn btn-secondary tv-focusable"
                tabIndex={0}
                onClick={() => onSelect({ ...hero, media_type: "movie" })}
              >
                More Info
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rows in user-configured order ── */}
      {rowOrder.map((id) => {
        if (!rowVisible[id]) return null;

        // Continue Watching
        if (id === "continue") {
          if (inProgress.length === 0) return null;
          return (
            <div key="continue" className="section">
              <div className="section-title">Continue Watching</div>
              <div className="cards-row">
                {inProgress.map((item) => {
                  const pk = item.media_type === "movie"
                    ? `movie_${item.id}`
                    : `tv_${item.id}_s${item.season}e${item.episode}`;
                  const r = getRating(item);
                  const restr = itemRestricted(item);
                  return (
                    <MediaCard
                      key={`${item.media_type}_${item.id}`}
                      item={item}
                      onClick={() => onSelect(item)}
                      progress={progress[pk] || 0}
                      watched={watched}
                      onMarkWatched={onMarkWatched}
                      onMarkUnwatched={onMarkUnwatched}
                      ageRating={r.cert}
                      restricted={restr}
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        // Watchlist
        if (id === "watchlist") {
          return renderCardRow("watchlist", "My Watchlist", savedList);
        }

        // Recently Added
        if (id === "recentlyAdded") {
          return renderCardRow("recentlyAdded", "Recently Added", recentlyAdded);
        }

        // Shared Library (cross-profile)
        if (id === "sharedLibrary") {
          return renderCardRow("sharedLibrary", "Shared Library", sharedLibrary, { badge: "📚" });
        }

        // Personal Media (user-added custom content)
        if (id === "personalMedia") {
          if (!personalMedia || personalMedia.length === 0) return null;
          return (
            <div key="personalMedia" className="section">
              <div className="section-title">
                <span className="row-badge">🎞</span> Personal Media
              </div>
              <div className="cards-row">
                {personalMedia.map((item) => renderCustomCard(item))}
              </div>
            </div>
          );
        }

        // Public Domain (archive.org)
        if (id === "publicDomain") {
          if (publicDomainItems.length === 0) return null;
          return (
            <div key="publicDomain" className="section">
              <div className="section-title">
                <span className="row-badge">🆓</span> Free to Watch
              </div>
              <div className="cards-row">
                {publicDomainItems.map((item) => renderCustomCard(item))}
              </div>
            </div>
          );
        }

        // Friends' Picks
        if (id === "friendsMedia") {
          return renderCardRow("friendsMedia", "Friends' Picks", friendsMedia, { badge: "👥" });
        }

        // JSON Catalogue
        if (id === "jsonCatalogue") {
          return renderCardRow("jsonCatalogue", "My Catalogue", jsonCatalogueItems, { badge: "📂" });
        }

        // Similar to…
        if (id === "similar") {
          if (!similarSource || similarItems.length === 0) return null;
          return renderCarouselOrList("similar", "Similar to", similarSource.title || similarSource.name, similarItems);
        }

        // Trending Movies
        if (id === "trendingMovies") {
          return renderCarouselOrList("trendingMovies", "Trending Movies", null, trendingMovieItems);
        }

        // Trending Series
        if (id === "trendingTV") {
          return renderCarouselOrList("trendingTV", "Trending Series", null, trendingTVItems);
        }

        // Top Rated
        if (id === "topRated") {
          return renderCarouselOrList("topRated", "Top Rated", null, topRatedItems);
        }

        // Genre rows
        if (id === "genreAction") return renderCardRow("genreAction", "Action", genreItems.genreAction);
        if (id === "genreDrama")  return renderCardRow("genreDrama",  "Drama",  genreItems.genreDrama);
        if (id === "genreComedy") return renderCardRow("genreComedy", "Comedy", genreItems.genreComedy);

        return null;
      })}
    </div>
  );
}
