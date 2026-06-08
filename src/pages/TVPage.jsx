import { useState, useEffect, useMemo, useRef } from "react";
import {
  tmdbFetch, imgUrl, fetchAnilistData,
  cleanAnilistDescription, isAnimeContent,
  getSourceUrl, PLAYER_SOURCES, NON_ANIME_DEFAULT_SOURCE,
} from "../utils/api";
import {
  PlayIcon, BookmarkIcon, BookmarkFillIcon, BackIcon,
  StarIcon, FilmIcon, WatchedIcon, TrailerIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";
import { isRestricted, getAgeLimitSetting } from "../utils/ageRating";
import { storage, STORAGE_KEYS } from "../utils/storage";
import TVPlayer from "../components/TVPlayer";

export default function TVPage({
  item, apiKey, onSave, isSaved, onHistory,
  progress, saveProgress,
  timestamps = {}, saveTimestamp = null,
  onBack, onSettings,
  watched, onMarkWatched, onMarkUnwatched,
  onSeriesNext, onSeriesNextClear,
  offline = false,
}) {
  const [details, setDetails] = useState(null);
  const [season, setSeason] = useState(item.season ?? 1);
  const [seasonDetails, setSeasonDetails] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
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
  const isAnime = details ? isAnimeContent(item, details) : false;

  useEffect(() => {
    if (!apiKey) return;
    let mounted = true;
    tmdbFetch(`/tv/${item.id}?append_to_response=videos`, apiKey)
      .then((data) => {
        if (!mounted) return;
        setDetails(data);
        const vids = data.videos?.results || [];
        const t = vids.find((v) => v.type === "Trailer" && v.site === "YouTube") || vids.find((v) => v.site === "YouTube");
        if (t) setTrailerKey(t.key);
      }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    let mounted = true;
    setSeasonDetails(null);
    tmdbFetch(`/tv/${item.id}/season/${season}`, apiKey)
      .then((data) => { if (mounted) setSeasonDetails(data); }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, season, apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    let mounted = true;
    tmdbFetch(`/tv/${item.id}/content_ratings`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const r = (data.results || []).find((r) => r.iso_3166_1 === "US") || (data.results || [])[0];
        if (r) setAgeRating({ cert: r.rating });
      }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  useEffect(() => {
    if (!isAnime || !title) return;
    let mounted = true;
    fetchAnilistData(title, "ANIME", item.id).then((d) => { if (mounted) setAnilistData(d); }).catch(() => {});
    return () => { mounted = false; };
  }, [isAnime, item.id, title]);

  const seasons = useMemo(() => (details?.seasons || []).filter((s) => s.season_number > 0), [details]);
  const episodes = seasonDetails?.episodes || [];

  const epKey = (s, ep) => `tv_${item.id}_s${s}e${ep}`;

  function handlePlayEpisode(ep) {
    onSeriesNextClear?.(item.id);
    onHistory({ ...item, media_type: "tv", season, episode: ep.episode_number, episodeName: ep.name });
    setPlaying({ season, episode: ep.episode_number, name: ep.name });
  }

  function handleNextEpisode(ep) {
    onSeriesNextClear?.(item.id);
    onHistory({ ...item, media_type: "tv", season, episode: ep.episode_number, episodeName: ep.name });
    setPlaying({ season, episode: ep.episode_number, name: ep.name });
  }

  function handleEpProgress(pct) {
    if (!playing) return;
    const pk = epKey(playing.season, playing.episode);
    saveProgress(pk, pct);
    if (pct > 90) {
      onMarkWatched(pk);
      const idx = episodes.findIndex((e) => e.episode_number === playing.episode);
      const nextEp = episodes[idx + 1];
      if (nextEp && onSeriesNext) {
        onSeriesNext(item.id, {
          id: item.id,
          title: item.title || item.name,
          name: item.name || item.title,
          poster_path: item.poster_path,
          media_type: "tv",
          season: playing.season,
          episode: nextEp.episode_number,
          episodeName: nextEp.name,
          watchedAt: Date.now(),
          _isSeriesNext: true,
        });
      }
    }
  }

  function handleEpTimestamp(t) {
    if (!playing) return;
    saveTimestamp?.(epKey(playing.season, playing.episode), t);
  }

  const overview = anilistData ? cleanAnilistDescription(anilistData.description) || details?.overview : details?.overview;
  const restricted = isRestricted(ageRating?.minAge, getAgeLimitSetting(storage));

  if (playing) {
    const pk = epKey(playing.season, playing.episode);
    const epIdx = episodes.findIndex((e) => e.episode_number === playing.episode);
    return (
      <TVPlayer
        title={`${title} · S${playing.season}E${playing.episode}${playing.name ? ` · ${playing.name}` : ""}`}
        progressKey={pk}
        initialProgress={progress[pk] || 0}
        initialTimestamp={timestamps[pk] || 0}
        onProgress={handleEpProgress}
        onTimestamp={handleEpTimestamp}
        onClose={() => setPlaying(null)}
        tmdbId={item.id}
        mediaType="tv"
        season={playing.season}
        episode={playing.episode}
        episodeList={episodes}
        currentEpIndex={epIdx}
        onNextEpisode={handleNextEpisode}
        malId={anilistData?.idMal || null}
        offline={offline}
        prefilledUrl={getSourceUrl(playerSource, "tv", item.id, playing.season, playing.episode)}
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
      <div className="detail-hero">
        {(details?.backdrop_path || item.backdrop_path) && (
          <div className="detail-hero-bg" style={{ backgroundImage: `url(${imgUrl(details?.backdrop_path || item.backdrop_path, "original")})` }} />
        )}
        <div className="detail-hero-gradient" />
        <div className="detail-hero-content">
          <button className="tv-btn tv-btn-ghost back-btn tv-focusable" tabIndex={0} onClick={onBack}>
            <BackIcon /> Back
          </button>
          <div className="detail-poster-wrap">
            {item.poster_path
              ? <img className="detail-poster" src={imgUrl(item.poster_path, "w342")} alt={title} />
              : <div className="detail-poster detail-poster-empty"><FilmIcon /></div>}
          </div>
          <div className="detail-info">
            <div className="detail-title">{title}</div>
            <div className="detail-meta">
              {details?.first_air_date?.slice(0, 4) && <span>{details.first_air_date.slice(0, 4)}</span>}
              {details?.number_of_seasons && <span>{details.number_of_seasons} Season{details.number_of_seasons !== 1 ? "s" : ""}</span>}
              {details?.vote_average > 0 && <span className="detail-rating"><StarIcon /> {details.vote_average.toFixed(1)}</span>}
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
              <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onSave}>
                {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}
                {isSaved ? "Saved" : "Watchlist"}
              </button>
              {trailerKey && (
                <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={() => setShowTrailer(true)}>
                  <TrailerIcon /> Trailer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 48px 48px" }}>
        {seasons.length > 1 && (
          <div className="season-tabs">
            {seasons.map((s) => (
              <button key={s.season_number} className={`season-tab tv-focusable ${season === s.season_number ? "active" : ""}`} tabIndex={0} onClick={() => setSeason(s.season_number)}>
                Season {s.season_number}
              </button>
            ))}
          </div>
        )}
        {!seasonDetails && <div className="tv-loading"><div className="spinner" /></div>}
        {episodes.length > 0 && (
          <>
            <div className="season-actions">
              {(() => {
                const allWatched = episodes.every((ep) => !!watched[epKey(season, ep.episode_number)]);
                return allWatched ? (
                  <button
                    className="tv-btn tv-btn-ghost tv-focusable"
                    tabIndex={0}
                    onClick={() => episodes.forEach((ep) => onMarkUnwatched(epKey(season, ep.episode_number)))}
                  >
                    <WatchedIcon /> Unmark Season
                  </button>
                ) : (
                  <button
                    className="tv-btn tv-btn-ghost tv-focusable"
                    tabIndex={0}
                    onClick={() => episodes.forEach((ep) => onMarkWatched(epKey(season, ep.episode_number)))}
                  >
                    <WatchedIcon /> Mark Season Watched
                  </button>
                );
              })()}
            </div>
          <div className="episode-list">
            {episodes.map((ep) => {
              const pk = epKey(season, ep.episode_number);
              const epProg = progress[pk] || 0;
              const epWatched = !!watched[pk];
              return (
                <button key={ep.id} className={`episode-card tv-focusable ${epWatched ? "ep-watched" : ""}`} tabIndex={0} disabled={restricted} onClick={() => !restricted && handlePlayEpisode(ep)}>
                  {ep.still_path && <img className="ep-still" src={imgUrl(ep.still_path, "w300")} alt={ep.name} />}
                  <div className="ep-info">
                    <div className="ep-num">E{ep.episode_number}</div>
                    <div className="ep-name">{ep.name}</div>
                    {ep.runtime && <div className="ep-runtime">{ep.runtime}m</div>}
                    {ep.overview && <div className="ep-overview">{ep.overview}</div>}
                    {epProg > 2 && epProg < 95 && (
                      <div className="ep-progress-bar"><div className="ep-progress-fill" style={{ width: `${epProg}%` }} /></div>
                    )}
                  </div>
                  <div className="ep-actions">
                    {!restricted && <span className="ep-play-icon"><PlayIcon /></span>}
                    {epWatched && <span className="ep-watched-icon"><WatchedIcon /></span>}
                  </div>
                </button>
              );
            })}
          </div>
          </>
        )}
      </div>

      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} onClose={() => setShowTrailer(false)} />}
    </div>
  );
}
