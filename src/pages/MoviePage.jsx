import { useState, useEffect, useRef, useCallback } from "react";
import {
  tmdbFetch, imgUrl, fetchAnilistData, cleanAnilistDescription,
  isAnimeContent, NON_ANIME_DEFAULT_SOURCE, getSourceUrl, PLAYER_SOURCES,
} from "../utils/api";
import {
  PlayIcon, BookmarkIcon, BookmarkFillIcon, BackIcon,
  StarIcon, FilmIcon, WatchedIcon, TrailerIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";
import MediaCard from "../components/MediaCard";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { fetchMovieRating, isRestricted, getAgeLimitSetting, getRatingCountry } from "../utils/ageRating";
import TVPlayer from "../components/TVPlayer";

export default function MoviePage({
  item,
  apiKey,
  onSave,
  isSaved,
  onHistory,
  progress,
  saveProgress,
  timestamps = {},
  saveTimestamp = null,
  onBack,
  onSettings,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  onSelect,
}) {
  const [details, setDetails] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [ageRating, setAgeRating] = useState(null);
  const [anilistData, setAnilistData] = useState(null);
  const [playerSource, setPlayerSource] = useState(
    () => storage.get(STORAGE_KEYS.PLAYER_SOURCE) || NON_ANIME_DEFAULT_SOURCE,
  );

  const pageRef = useRef(null);
  useEffect(() => {
    if (playing) return;
    const t = setTimeout(() => {
      const el = pageRef.current?.querySelector('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      el?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [playing]);

  const title = item.title || item.name;
  const progressKey = `movie_${item.id}`;
  const isWatched = !!watched[progressKey];
  const watchProgress = progress[progressKey] || 0;
  const isAnime = details ? isAnimeContent(item, details) : false;

  // Fetch movie details
  useEffect(() => {
    if (!apiKey) return;
    let mounted = true;
    tmdbFetch(`/movie/${item.id}?append_to_response=videos,credits,similar`, apiKey)
      .then((data) => {
        if (!mounted) return;
        setDetails(data);
        // Trailer
        const vids = data.videos?.results || [];
        const trailer = vids.find((v) => v.type === "Trailer" && v.site === "YouTube")
          || vids.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
        // Similar
        setSimilar((data.similar?.results || []).slice(0, 12).map((m) => ({ ...m, media_type: "movie" })));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // Fetch age rating
  useEffect(() => {
    if (!apiKey) return;
    let mounted = true;
    const country = getRatingCountry(storage);
    fetchMovieRating(item.id, apiKey, country).then((r) => {
      if (mounted) setAgeRating(r);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // AniList metadata for anime
  useEffect(() => {
    if (!isAnime || !title) return;
    let mounted = true;
    fetchAnilistData(title, "ANIME", item.id).then((d) => {
      if (mounted) setAnilistData(d);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [isAnime, item.id, title]);

  const handlePlay = useCallback(() => {
    onHistory({ ...item, media_type: "movie" });
    setPlaying(true);
  }, [item, onHistory]);

  const handleProgress = useCallback((pct) => {
    saveProgress(progressKey, pct);
    if (pct > 90 && !isWatched) onMarkWatched(progressKey);
  }, [progressKey, saveProgress, isWatched, onMarkWatched]);

  const handleTimestamp = useCallback((t) => {
    saveTimestamp?.(progressKey, t);
  }, [progressKey, saveTimestamp]);

  const overview = anilistData
    ? cleanAnilistDescription(anilistData.description) || details?.overview
    : details?.overview;

  const restricted = isRestricted(ageRating?.minAge, getAgeLimitSetting(storage));

  if (playing) {
    return (
      <TVPlayer
        title={title}
        progressKey={progressKey}
        initialProgress={watchProgress}
        initialTimestamp={timestamps[progressKey] || 0}
        onProgress={handleProgress}
        onTimestamp={handleTimestamp}
        onClose={() => setPlaying(false)}
        apiKey={apiKey}
        tmdbId={item.id}
        mediaType="movie"
        prefilledUrl={getSourceUrl(playerSource, "movie", item.id)}
        playerSource={playerSource}
        onSourceChange={(src) => {
          setPlayerSource(src);
          storage.set(STORAGE_KEYS.PLAYER_SOURCE, src);
        }}
        skipGate={true}
      />
    );
  }

  return (
    <div className="detail-page fade-in" ref={pageRef}>
      {/* Hero backdrop */}
      <div className="detail-hero">
        {(details?.backdrop_path || item.backdrop_path) && (
          <div
            className="detail-hero-bg"
            style={{ backgroundImage: `url(${imgUrl(details?.backdrop_path || item.backdrop_path, "original")})` }}
          />
        )}
        <div className="detail-hero-gradient" />
        <div className="detail-hero-content">
          <button className="tv-btn tv-btn-ghost back-btn tv-focusable" tabIndex={0} onClick={onBack}>
            <BackIcon /> Back
          </button>
          <div className="detail-poster-wrap">
            {item.poster_path ? (
              <img className="detail-poster" src={imgUrl(item.poster_path, "w342")} alt={title} />
            ) : (
              <div className="detail-poster detail-poster-empty"><FilmIcon /></div>
            )}
          </div>
          <div className="detail-info">
            <div className="detail-title">{title}</div>
            <div className="detail-meta">
              {details?.release_date?.slice(0, 4) && <span>{details.release_date.slice(0, 4)}</span>}
              {details?.runtime && <span>{Math.floor(details.runtime / 60)}h {details.runtime % 60}m</span>}
              {details?.vote_average > 0 && (
                <span className="detail-rating"><StarIcon /> {details.vote_average.toFixed(1)}</span>
              )}
              {ageRating?.cert && <span className="age-cert">{ageRating.cert}</span>}
            </div>
            {(details?.genres || []).length > 0 && (
              <div className="detail-genres">
                {details.genres.map((g) => <span key={g.id} className="genre-tag">{g.name}</span>)}
              </div>
            )}
            <div className="detail-overview">{overview}</div>
            <div className="source-picker-bar" style={{ marginBottom: "16px" }}>
              {PLAYER_SOURCES.map((src) => (
                <button
                  key={src.id}
                  className={`tv-btn source-picker-btn tv-focusable${playerSource === src.id ? " tv-btn-primary" : " tv-btn-ghost"}`}
                  tabIndex={0}
                  onClick={() => {
                    setPlayerSource(src.id);
                    storage.set(STORAGE_KEYS.PLAYER_SOURCE, src.id);
                  }}
                >
                  {src.label}
                  {src.note && <span className="source-picker-note">({src.note})</span>}
                </button>
              ))}
            </div>
            <div className="detail-actions">
              {!restricted && (
                <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={handlePlay}>
                  <PlayIcon />
                  {watchProgress > 2 && watchProgress < 95 ? "Resume" : "Watch"}
                  {watchProgress > 2 && watchProgress < 95 && (
                    <span className="resume-pct"> ({Math.round(watchProgress)}%)</span>
                  )}
                </button>
              )}
              {trailerKey && (
                <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={() => setShowTrailer(true)}>
                  <TrailerIcon /> Trailer
                </button>
              )}
              <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onSave}>
                {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}
                {isSaved ? "Saved" : "Watchlist"}
              </button>
              <button
                className="tv-btn tv-btn-ghost tv-focusable"
                tabIndex={0}
                onClick={() => isWatched ? onMarkUnwatched(progressKey) : onMarkWatched(progressKey)}
              >
                <WatchedIcon /> {isWatched ? "Unwatch" : "Mark Watched"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Similar movies */}
      {similar.length > 0 && (
        <div className="section" style={{ padding: "0 48px" }}>
          <div className="section-title">More Like This</div>
          <div className="cards-row">
            {similar.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                onClick={() => onSelect(m)}
                progress={0}
                watched={watched}
                onMarkWatched={onMarkWatched}
                onMarkUnwatched={onMarkUnwatched}
              />
            ))}
          </div>
        </div>
      )}

      {showTrailer && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setShowTrailer(false)} />
      )}
    </div>
  );
}
