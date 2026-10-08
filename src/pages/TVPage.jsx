import { useState, useEffect, useMemo, useRef } from "react";
import {
  tmdbFetch, imgUrl, fetchAnilistData,
  cleanAnilistDescription, isAnimeContent,
  getSourceUrl,
} from "../utils/api";
import {
  PlayIcon, BookmarkIcon, BookmarkFillIcon, BackIcon,
  StarIcon, FilmIcon, WatchedIcon, TrailerIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";
import { isRestricted, getAgeLimitSetting } from "../utils/ageRating";
import { storage } from "../utils/storage";
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

  const pageRef = useRef(null);
  const focusPlaced = useRef(false);

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

  // Episode to continue in the shown season: the one Continue Watching opened,
  // else the first unwatched, else the first.
  const continueEpNum = useMemo(() => {
    if (!episodes.length) return null;
    if (item.episode != null && item.season === season &&
        episodes.some((e) => e.episode_number === item.episode)) return item.episode;
    const firstUnwatched = episodes.find((e) => !watched[epKey(season, e.episode_number)]);
    return (firstUnwatched || episodes[0]).episode_number;
  }, [episodes, season, item.episode, item.season, watched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial focus (and again after closing the player): start on Back while
  // TMDB loads, then move to the active season tab — the season Continue
  // Watching opened (item.season) or Season 1 — or, for one-season shows, the
  // episode to continue. Never steals focus once the user has moved off Back.
  useEffect(() => {
    if (playing) { focusPlaced.current = false; return; }
    if (focusPlaced.current) return;
    const t = setTimeout(() => {
      const root = pageRef.current;
      if (!root) return;
      const active = document.activeElement;
      const userMoved = active && active !== document.body && root.contains(active) &&
        !active.classList.contains("back-btn");
      if (userMoved) { focusPlaced.current = true; return; }
      const target = seasons.length > 1
        ? root.querySelector(".season-tab.active")
        : root.querySelector("[data-continue-ep]");
      if (target) { target.focus(); focusPlaced.current = true; return; }
      // Not loaded yet: hold focus on Back so the remote works meanwhile.
      if (!root.contains(active)) {
        root.querySelector('button:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
      }
    }, 80);
    return () => clearTimeout(t);
  }, [playing, seasons.length, seasonDetails]);

  // Starting an episode does NOT clear the show's "Up Next" card: if the TV is
  // switched off before the new episode passes the 5% in-progress threshold,
  // the card is what keeps the show in Continue Watching. The card is hidden
  // automatically once an episode of the show is in progress (App.jsx), and
  // replaced when that episode is finished.
  function handlePlayEpisode(ep) {
    onHistory({ ...item, media_type: "tv", season, episode: ep.episode_number, episodeName: ep.name });
    setPlaying({ season, episode: ep.episode_number, name: ep.name });
  }

  function handleNextEpisode(ep) {
    onHistory({ ...item, media_type: "tv", season, episode: ep.episode_number, episodeName: ep.name });
    setPlaying({ season, episode: ep.episode_number, name: ep.name });
  }

  const aired = (date) => !!date && date <= new Date().toISOString().slice(0, 10);
  const queuedFor = useRef(null); // progress arrives every few seconds — queue once per episode

  function handleEpProgress(pct) {
    if (!playing) return;
    const pk = epKey(playing.season, playing.episode);
    saveProgress(pk, pct);
    if (pct <= 90 || queuedFor.current === pk) return;
    queuedFor.current = pk;
    onMarkWatched(pk);

    // Queue the next episode: the first later, not-yet-watched episode of this
    // season (so rewatching an old episode doesn't lose your real place), else
    // episode 1 of the next season.
    const idx = episodes.findIndex((e) => e.episode_number === playing.episode);
    const later = episodes.slice(idx + 1);
    const nextEp = later.find((e) => !watched[epKey(playing.season, e.episode_number)]);
    let next = null;
    if (nextEp) {
      if (aired(nextEp.air_date)) next = { season: playing.season, episode: nextEp.episode_number, episodeName: nextEp.name };
    } else {
      const nextSeason = seasons.find((s) => s.season_number === playing.season + 1);
      if (nextSeason && nextSeason.episode_count > 0 && aired(nextSeason.air_date)) {
        next = { season: nextSeason.season_number, episode: 1, episodeName: "" };
      }
    }
    if (next && onSeriesNext) {
      onSeriesNext(item.id, {
        id: item.id,
        title: item.title || item.name,
        name: item.name || item.title,
        poster_path: item.poster_path,
        media_type: "tv",
        ...next,
        watchedAt: Date.now(),
        _isSeriesNext: true,
      });
    } else {
      // Finished everything that has aired — nothing to continue.
      onSeriesNextClear?.(item.id);
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
        prefilledUrl={getSourceUrl("tv", item.id, playing.season, playing.episode)}
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
                <button key={ep.id} className={`episode-card tv-focusable ${epWatched ? "ep-watched" : ""}`} tabIndex={0} disabled={restricted} onClick={() => !restricted && handlePlayEpisode(ep)}
                  data-continue-ep={ep.episode_number === continueEpNum ? "" : undefined}>
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
