import { useState, useEffect, useMemo, useCallback } from "react";
import MediaCard from "../components/MediaCard";
import { PlayIcon, StarIcon, FilmIcon } from "../components/Icons";
import { imgUrl, tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { loadHomeLayout } from "../utils/homeLayout";
import { fetchPublicDomainMovies } from "../utils/archiveOrg";



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
  const [topRatedItems, setTopRatedItems] = useState([]);
  const [publicDomainItems, setPublicDomainItems] = useState([]);
  const [movieGenres, setMovieGenres] = useState([]);
  const [tvGenres, setTvGenres] = useState([]);
  const [selectedMovieGenreId, setSelectedMovieGenreId] = useState(null);
  const [selectedTvGenreId, setSelectedTvGenreId] = useState(null);
  const [genreMoviesItems, setGenreMoviesItems] = useState([]);
  const [genreSeriesItems, setGenreSeriesItems] = useState([]);

  const [layout] = useState(() => loadHomeLayout());
  const { order: rowOrder, visible: rowVisible } = layout;

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

  // ── New Releases (TMDB now_playing + on_the_air) ─────────────────────────
  const [newReleasesItems, setNewReleasesItems] = useState([]);
  useEffect(() => {
    if (!apiKey || offline) return;
    const ctrl = new AbortController();
    Promise.all([
      tmdbFetch("/movie/now_playing?page=1", apiKey, { signal: ctrl.signal }),
      tmdbFetch("/tv/on_the_air?page=1", apiKey, { signal: ctrl.signal }),
    ]).then(([m, t]) => {
      const movies = (m.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "movie" }));
      const tv = (t.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "tv" }));
      const merged = [];
      for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
        if (movies[i]) merged.push(movies[i]);
        if (tv[i]) merged.push(tv[i]);
      }
      setNewReleasesItems(merged.slice(0, 20));
    }).catch((e) => { if (e.name !== "AbortError") console.warn(e); });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // ── Stable card arrays ────────────────────────────────────────────────────
  const trendingMovieItems = useMemo(
    () => trending.slice(0, 20).map((i) => ({ ...i, media_type: "movie" })),
    [trending],
  );
  const trendingTVItems = useMemo(
    () => trendingTV.slice(0, 20).map((i) => ({ ...i, media_type: "tv" })),
    [trendingTV],
  );

  // ── Fetch: recommendations (last 3 watched → merged + deduped) ───────────
  useEffect(() => {
    if (!apiKey || offline || !history || history.length === 0) return;
    const sources = history.slice(0, 3);
    let cancelled = false;
    Promise.all(
      sources.map((src) => {
        const type = src.media_type === "tv" ? "tv" : "movie";
        return tmdbFetch(`/${type}/${src.id}/recommendations`, apiKey)
          .then((d) => (d.results || []).map((i) => ({ ...i, media_type: type })))
          .catch(() => []);
      }),
    ).then((arrays) => {
      if (cancelled) return;
      const watchedIds = new Set(history.map((h) => `${h.media_type}_${h.id}`));
      const seen = new Set();
      const merged = [];
      for (const arr of arrays) {
        for (const item of arr) {
          const key = `${item.media_type}_${item.id}`;
          if (!seen.has(key) && !watchedIds.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
      }
      merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      setSimilarItems(merged.slice(0, 20));
    });
    return () => { cancelled = true; };
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
      const movies = (m.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "movie" }));
      const tv = (t.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "tv" }));
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

  // ── Fetch: TMDB genre lists (movie + TV) ──────────────────────────────────
  useEffect(() => {
    if (!apiKey || offline) return;
    const ctrl = new AbortController();
    Promise.all([
      tmdbFetch("/genre/movie/list", apiKey, { signal: ctrl.signal }),
      tmdbFetch("/genre/tv/list", apiKey, { signal: ctrl.signal }),
    ]).then(([m, t]) => {
      const mg = (m.genres || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      const tg = (t.genres || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      setMovieGenres(mg);
      setTvGenres(tg);
      setSelectedMovieGenreId((prev) => prev ?? (mg[0]?.id ?? null));
      setSelectedTvGenreId((prev) => prev ?? (tg[0]?.id ?? null));
    }).catch(() => {});
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // ── Fetch: genre movies (refetch on genre change) ─────────────────────────
  useEffect(() => {
    if (!apiKey || offline || !selectedMovieGenreId) return;
    let cancelled = false;
    tmdbFetch(
      `/discover/movie?with_genres=${selectedMovieGenreId}&sort_by=vote_average.desc&vote_count.gte=100&page=1`,
      apiKey,
    ).then((d) => {
      if (!cancelled) setGenreMoviesItems((d.results || []).slice(0, 20).map((i) => ({ ...i, media_type: "movie" })));
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline, selectedMovieGenreId]);

  // ── Fetch: genre series (refetch on genre change) ─────────────────────────
  useEffect(() => {
    if (!apiKey || offline || !selectedTvGenreId) return;
    let cancelled = false;
    tmdbFetch(
      `/discover/tv?with_genres=${selectedTvGenreId}&sort_by=vote_average.desc&vote_count.gte=100&page=1`,
      apiKey,
    ).then((d) => {
      if (!cancelled) setGenreSeriesItems((d.results || []).slice(0, 20).map((i) => ({ ...i, media_type: "tv" })));
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline, selectedTvGenreId]);

  // ── Cross-row deduplication (TMDB rows only, in display order) ───────────
  const deduplicatedItems = useMemo(() => {
    const seenIds = new Set();
    const dedup = (items) => {
      if (!items || items.length === 0) return [];
      const out = items.filter((i) => {
        const k = `${i.media_type || "movie"}_${i.id}`;
        return !seenIds.has(k);
      });
      out.forEach((i) => seenIds.add(`${i.media_type || "movie"}_${i.id}`));
      return out;
    };
    const result = {};
    for (const id of rowOrder) {
      if (id === "recentlyAdded") result.recentlyAdded = dedup(newReleasesItems);
      else if (id === "similar") result.similar = dedup(similarItems);
      else if (id === "trendingMovies") result.trendingMovies = dedup(trendingMovieItems);
      else if (id === "trendingTV") result.trendingTV = dedup(trendingTVItems);
      else if (id === "topRated") result.topRated = dedup(topRatedItems);
      else if (id === "genreMovies") result.genreMovies = dedup(genreMoviesItems);
      else if (id === "genreSeries") result.genreSeries = dedup(genreSeriesItems);
    }
    return result;
  }, [rowOrder, newReleasesItems, similarItems, trendingMovieItems, trendingTVItems, topRatedItems, genreMoviesItems, genreSeriesItems]);

  // ── Row renderers ─────────────────────────────────────────────────────────
  const renderGenreRow = (key, title, items, genres, selectedId, onSelectGenre) => {
    if (!genres || genres.length === 0) return null;
    const idx = genres.findIndex((g) => g.id === selectedId);
    const currentName = genres[idx]?.name || "";
    const cyclePrev = (e) => { e.stopPropagation(); onSelectGenre(genres[(idx - 1 + genres.length) % genres.length].id); };
    const cycleNext = (e) => { e.stopPropagation(); onSelectGenre(genres[(idx + 1) % genres.length].id); };
    return (
      <div key={key} className="section">
        <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{title}</span>
          <button
            tabIndex={0}
            data-focusable
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); cyclePrev(e); }
              else if (e.key === "ArrowRight") { e.preventDefault(); cycleNext(e); }
            }}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 14px",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ opacity: 0.5 }}>‹</span>
            <span style={{ minWidth: "8rem", textAlign: "center" }}>{currentName}</span>
            <span style={{ opacity: 0.5 }}>›</span>
          </button>
        </div>
        {items && items.length > 0 ? (
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
        ) : (
          <div style={{ color: "var(--text3)", fontSize: 13, padding: "16px 0" }}>Loading…</div>
        )}
      </div>
    );
  };

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
                      isUpNext={!!item._isSeriesNext}
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
          return renderCardRow("recentlyAdded", "Recently Added", deduplicatedItems.recentlyAdded || []);
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

        // You Would Love This
        if (id === "similar") {
          if ((deduplicatedItems.similar || []).length === 0) return null;
          return renderCarouselOrList("similar", "You Would Love This", null, deduplicatedItems.similar);
        }

        // Trending Movies
        if (id === "trendingMovies") {
          return renderCarouselOrList("trendingMovies", "Trending Movies", null, deduplicatedItems.trendingMovies || []);
        }

        // Trending Series
        if (id === "trendingTV") {
          return renderCarouselOrList("trendingTV", "Trending Series", null, deduplicatedItems.trendingTV || []);
        }

        // Top Rated
        if (id === "topRated") {
          return renderCarouselOrList("topRated", "Top Rated", null, deduplicatedItems.topRated || []);
        }

        // Genre rows
        if (id === "genreMovies") return renderGenreRow("genreMovies", "Movies", deduplicatedItems.genreMovies || [], movieGenres, selectedMovieGenreId, setSelectedMovieGenreId);
        if (id === "genreSeries") return renderGenreRow("genreSeries", "Series", deduplicatedItems.genreSeries || [], tvGenres, selectedTvGenreId, setSelectedTvGenreId);

        return null;
      })}
    </div>
  );
}
