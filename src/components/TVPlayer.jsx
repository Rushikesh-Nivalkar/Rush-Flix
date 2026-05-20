import { useState, useEffect, useRef, useCallback } from "react";
import { storage, STORAGE_KEYS, getCurrentPStore } from "../utils/storage";
import { PLAYER_SOURCES, getSourceUrl, NON_ANIME_DEFAULT_SOURCE } from "../utils/api";
import { fetchAniSkipTimings } from "../utils/aniSkip";
import { fetchSubtitleUrl, revokeSubtitleUrl } from "../utils/subtitleFetch";
import { SUBTITLE_LANGUAGES } from "../utils/subtitles";

const UP_NEXT_DELAY = 10;

function detectMode(u) {
  if (!u) return "input";
  if (/\.(mp4|mkv|webm|m3u8|ts|mov|avi)(\?|$)/i.test(u)) return "video";
  return "iframe";
}

export default function TVPlayer({
  title,
  progressKey,
  initialProgress = 0,
  initialTimestamp = 0,
  onProgress,
  onTimestamp = null,
  onClose,
  apiKey,
  tmdbId,
  mediaType,
  season,
  episode,
  prefilledUrl = "",
  playerSource = null,
  onSourceChange = null,
  // Episode navigation
  episodeList = [],
  currentEpIndex = -1,
  onNextEpisode = null,
  // AniSkip
  malId = null,
  // Network
  offline = false,
}) {
  const [url, setUrl] = useState(() => {
    const initUrl = prefilledUrl || (storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {})[progressKey] || "";
    return initUrl;
  });
  const [urlInput, setUrlInput] = useState("");
  const [mode, setMode] = useState(() => {
    const initUrl = prefilledUrl || (storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {})[progressKey] || "";
    return detectMode(initUrl);
  });
  const [activeSource, setActiveSource] = useState(playerSource || NON_ANIME_DEFAULT_SOURCE);
  const [buffering, setBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showEpList, setShowEpList] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(null);
  const [skipIntroSegment, setSkipIntroSegment] = useState(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  // Subtitles
  const [subtitleUrl, setSubtitleUrl] = useState(null);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleLang, setSubtitleLang] = useState(
    () => getCurrentPStore().get(STORAGE_KEYS.SUBTITLE_LANG) || "en",
  );
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [subtitleLoading, setSubtitleLoading] = useState(false);

  const subtitleSize = getCurrentPStore().get(STORAGE_KEYS.SUBTITLE_SIZE) || "medium";
  const subtitlePosition = getCurrentPStore().get(STORAGE_KEYS.SUBTITLE_POSITION) || "bottom";

  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const progressInterval = useRef(null);
  const countdownInterval = useRef(null);
  const inputRef = useRef(null);
  const positionRestored = useRef(false);

  const introSkipMode = getCurrentPStore().get(STORAGE_KEYS.INTRO_SKIP_MODE) || "prompt";
  const hasNextEp = currentEpIndex >= 0 && currentEpIndex < episodeList.length - 1;
  const nextEp = hasNextEp ? episodeList[currentEpIndex + 1] : null;

  // Auto-focus URL input
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(progressInterval.current);
      clearInterval(countdownInterval.current);
    };
  }, []);

  // Keyboard: back, skip ±10s, toggle episode list
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Backspace" || e.key === "Escape" || e.key === "GoBack") {
        if (showEpList) { e.preventDefault(); setShowEpList(false); return; }
        if (upNextCountdown !== null) { e.preventDefault(); cancelUpNext(); return; }
        e.preventDefault();
        onClose();
        return;
      }
      // In iframe mode: seek via native bridge (APK) or postMessage fallback (browser)
      if (mode === "iframe") {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const delta = e.key === "ArrowRight" ? 10 : -10;
          if (window.RushFlixBridge) {
            try { window.RushFlixBridge.seekRelative(delta); } catch {}
          } else {
            try { iframeRef.current?.contentWindow?.postMessage({ type: "rushflix_seek_relative", delta }, "*"); } catch {}
          }
        }
        return;
      }

      if (mode !== "video" || !videoRef.current) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        videoRef.current.currentTime = Math.min(
          videoRef.current.currentTime + 10,
          videoRef.current.duration || Infinity,
        );
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
      }
      if (e.key === "ArrowDown" && episodeList.length > 1) {
        e.preventDefault();
        setShowEpList((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, mode, showEpList, upNextCountdown, episodeList.length]);

  // Fetch AniSkip intro timings for anime episodes
  useEffect(() => {
    if (!malId || !episode || introSkipMode === "off") return;
    fetchAniSkipTimings(malId, episode).then((timings) => {
      if (timings?.intro) setSkipIntroSegment(timings.intro);
    }).catch(() => {});
  }, [malId, episode, introSkipMode]);

  // Apply subtitle size CSS var
  useEffect(() => {
    const sizeMap = { small: "1.1rem", medium: "1.6rem", large: "2.2rem" };
    document.documentElement.style.setProperty("--sub-size", sizeMap[subtitleSize] || "1.6rem");
    return () => document.documentElement.style.removeProperty("--sub-size");
  }, [subtitleSize]);

  // Apply subtitle cue position after track loads
  useEffect(() => {
    if (!subtitleUrl || !videoRef.current) return;
    const video = videoRef.current;
    const applyPosition = () => {
      const track = video.textTracks[0];
      if (!track || !track.cues) return;
      const lineVal = subtitlePosition === "top" ? 10 : 90;
      for (const cue of track.cues) {
        cue.line = lineVal;
        cue.snapToLines = false;
      }
    };
    const onLoad = () => applyPosition();
    video.addEventListener("loadedmetadata", onLoad);
    applyPosition();
    return () => video.removeEventListener("loadedmetadata", onLoad);
  }, [subtitleUrl, subtitlePosition]);

  // Fetch subtitles when video mode active and TMDB ID known
  useEffect(() => {
    if (mode !== "video" || !tmdbId) return;
    const subtitlePref = getCurrentPStore().get(STORAGE_KEYS.SUBTITLE_ENABLED);
    if (subtitlePref === false) return;
    let cancelled = false;
    setSubtitleLoading(true);
    fetchSubtitleUrl(tmdbId, mediaType, season, episode, subtitleLang).then((url) => {
      if (cancelled) return;
      if (url) {
        setSubtitleUrl(url);
        setSubtitleEnabled(true);
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setSubtitleLoading(false); });
    return () => { cancelled = true; };
  }, [mode, tmdbId, mediaType, season, episode, subtitleLang]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => { if (subtitleUrl) revokeSubtitleUrl(subtitleUrl); };
  }, [subtitleUrl]);

  // Progress save interval (every 5s when playing)
  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    onProgress?.((v.currentTime / v.duration) * 100);
  }, [onProgress]);

  useEffect(() => {
    if (mode !== "video") return;
    progressInterval.current = setInterval(saveProgress, 5000);
    return () => clearInterval(progressInterval.current);
  }, [mode, saveProgress]);

  // Open native overlay WebView when an embed URL is active (APK only).
  // Falls back gracefully — browser keeps using the <iframe> below.
  useEffect(() => {
    if (mode !== "iframe" || !url) return;
    const bridge = window.RushFlixBridge;
    if (!bridge) return;
    const seekTo = initialTimestamp > 30 ? Math.floor(initialTimestamp) : 0;
    bridge.openPlayer(url, seekTo);
    return () => { try { bridge.closePlayer(); } catch {} };
  }, [url, mode]); // initialTimestamp excluded — don't re-seek on prop update

  // Listen for progress and player-closed messages from the native bridge.
  // rushflix_progress: relayed by RushFlixProgress JavascriptInterface every 5s.
  // rushflix_player_closed: fired when user presses Back on the TV remote.
  useEffect(() => {
    if (mode !== "iframe") return;
    const handler = (e) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "rushflix_progress") {
        const { currentTime, duration } = d;
        if (!duration) return;
        onProgress?.((currentTime / duration) * 100);
        onTimestamp?.(currentTime);
      }
      if (d.type === "rushflix_player_closed") {
        onClose();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [mode, onProgress, onTimestamp, onClose]);

  // Browser fallback: focus iframe on load (no postMessage — no injected script in browser).
  const handleIframeLoad = useCallback(() => {
    iframeRef.current?.focus();
  }, []);

  // Restore seek position once video metadata is loaded
  const handleCanPlay = useCallback(() => {
    setBuffering(false);
    setVideoError(false);
    if (!positionRestored.current && initialProgress > 5) {
      const v = videoRef.current;
      if (v && v.duration > 0) {
        v.currentTime = (initialProgress / 100) * v.duration;
        positionRestored.current = true;
      }
    }
  }, [initialProgress]);

  // Time update: skip intro detection
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !skipIntroSegment || introSkipMode === "off") return;
    const t = v.currentTime;
    const { startTime, endTime } = skipIntroSegment;
    if (t >= startTime && t <= endTime) {
      if (introSkipMode === "auto") {
        v.currentTime = endTime;
        setShowSkipIntro(false);
      } else {
        setShowSkipIntro(true);
      }
    } else {
      setShowSkipIntro(false);
    }
  }, [skipIntroSegment, introSkipMode]);

  // Up Next countdown
  function startUpNext() {
    if (!hasNextEp || !nextEp) return;
    setUpNextCountdown(UP_NEXT_DELAY);
    let remaining = UP_NEXT_DELAY;
    countdownInterval.current = setInterval(() => {
      remaining -= 1;
      setUpNextCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownInterval.current);
        playNextEp();
      }
    }, 1000);
  }

  function cancelUpNext() {
    clearInterval(countdownInterval.current);
    setUpNextCountdown(null);
  }

  function playNextEp() {
    cancelUpNext();
    if (nextEp && onNextEpisode) onNextEpisode(nextEp);
  }

  function handleVideoEnded() {
    onProgress?.(100);
    if (hasNextEp) startUpNext();
  }

  function handlePlay() {
    const target = urlInput.trim() || url;
    if (!target) return;
    const sources = storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {};
    sources[progressKey] = target;
    storage.set(STORAGE_KEYS.CUSTOM_SOURCES, sources);
    setUrl(target);
    setMode(detectMode(target));
    setVideoError(false);
    positionRestored.current = false;
  }

  function handleSourceChange(srcId) {
    const saved = storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {};
    if (saved[progressKey]) { delete saved[progressKey]; storage.set(STORAGE_KEYS.CUSTOM_SOURCES, saved); }
    const newUrl = getSourceUrl(srcId, mediaType, tmdbId, season, episode);
    setUrl(newUrl);
    setMode(detectMode(newUrl));
    setActiveSource(srcId);
    setVideoError(false);
    positionRestored.current = false;
    onSourceChange?.(srcId);
  }

  // ── Up Next overlay ────────────────────────────────────────────────────────
  const UpNextOverlay = upNextCountdown !== null && nextEp ? (
    <div className="up-next-overlay">
      <div className="up-next-label">Up Next</div>
      <div className="up-next-ep">E{nextEp.episode_number} · {nextEp.name}</div>
      <div className="up-next-countdown">{upNextCountdown}s</div>
      <div className="up-next-actions">
        <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={playNextEp}>
          Play Now
        </button>
        <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={cancelUpNext}>
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  // ── Episode list overlay ───────────────────────────────────────────────────
  const EpListOverlay = showEpList && episodeList.length > 0 ? (
    <div className="ep-list-overlay">
      <div className="ep-list-overlay-title">Episodes</div>
      <div className="ep-list-overlay-scroll">
        {episodeList.map((ep, i) => (
          <button
            key={ep.id || ep.episode_number}
            className={`ep-list-overlay-item tv-focusable${i === currentEpIndex ? " current" : ""}`}
            tabIndex={0}
            onClick={() => {
              setShowEpList(false);
              cancelUpNext();
              if (i !== currentEpIndex && onNextEpisode) onNextEpisode(ep);
            }}
          >
            {i === currentEpIndex && <span className="ep-list-playing">▶</span>}
            <span className="ep-list-num">E{ep.episode_number}</span>
            <span className="ep-list-name">{ep.name}</span>
          </button>
        ))}
      </div>
      <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={() => setShowEpList(false)}>
        Close
      </button>
    </div>
  ) : null;

  return (
    <div className="tv-player-overlay">
      {offline && (
        <div className="player-offline-banner">No internet · Playback may fail</div>
      )}

      {/* ── URL input screen ─────────────────────────────────────────────── */}
      {mode === "input" && (
        <div className="tv-player-input-screen">
          <div className="tv-player-title">{title}</div>
          {season != null && (
            <div className="tv-player-episode">Season {season} · Episode {episode}</div>
          )}
          <div className="tv-player-hint">
            Enter a direct video URL (MP4, HLS) or embed URL to play
          </div>
          <div className="tv-player-url-row">
            <input
              ref={inputRef}
              className="tv-input tv-player-url-input"
              type="url"
              placeholder="https://example.com/video.mp4"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePlay();
                if (e.key === "Escape") onClose();
              }}
            />
            <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={handlePlay}>
              Play
            </button>
          </div>
          <button className="tv-btn tv-btn-ghost tv-focusable mt-lg" tabIndex={0} onClick={onClose}>
            Cancel
          </button>
          <div className="tv-player-tip">
            Tip: Add video sources in Sources to skip this step.
          </div>
        </div>
      )}

      {/* ── Native video player ──────────────────────────────────────────── */}
      {mode === "video" && (
        <div className="tv-video-wrap">
          {PLAYER_SOURCES.length > 1 && (
            <div className="source-picker-bar">
              {PLAYER_SOURCES.map((src) => (
                <button
                  key={src.id}
                  className={`tv-btn source-picker-btn${activeSource === src.id ? " tv-btn-primary" : " tv-btn-ghost"}`}
                  tabIndex={0}
                  onClick={() => handleSourceChange(src.id)}
                >
                  {src.label}
                  {src.note && <span className="source-picker-note">({src.note})</span>}
                </button>
              ))}
            </div>
          )}
          <video
            ref={videoRef}
            className="tv-video"
            src={url}
            autoPlay
            controls
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => { setBuffering(false); setVideoError(false); }}
            onCanPlay={handleCanPlay}
            onError={() => { setVideoError(true); setBuffering(false); }}
            onEnded={handleVideoEnded}
          >
            {subtitleUrl && (
              <track
                kind="subtitles"
                src={subtitleUrl}
                default={subtitleEnabled}
                label={SUBTITLE_LANGUAGES.find((l) => l.code === subtitleLang)?.label || subtitleLang}
                srcLang={subtitleLang}
              />
            )}
          </video>

          {buffering && !videoError && (
            <div className="player-buffering"><div className="spinner" /></div>
          )}

          {videoError && (
            <div className="player-error">
              <div className="player-error-title">Playback error</div>
              <div className="player-error-sub">Cannot load video. Check URL or network.</div>
              <div className="player-error-actions">
                <button
                  className="tv-btn tv-btn-primary tv-focusable"
                  tabIndex={0}
                  onClick={() => {
                    setVideoError(false);
                    positionRestored.current = false;
                    const v = videoRef.current;
                    if (v) { v.load(); v.play().catch(() => {}); }
                  }}
                >
                  Retry
                </button>
                <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={() => { setMode("input"); setVideoError(false); }}>
                  Change URL
                </button>
                <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Subtitle controls */}
          {tmdbId && mode === "video" && (
            <div className="subtitle-controls">
              <button
                className={`subtitle-toggle-btn tv-focusable${subtitleEnabled && subtitleUrl ? " active" : ""}`}
                tabIndex={0}
                disabled={subtitleLoading || !subtitleUrl}
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  const track = v.textTracks[0];
                  if (track) {
                    const next = !subtitleEnabled;
                    track.mode = next ? "showing" : "hidden";
                    setSubtitleEnabled(next);
                    getCurrentPStore().set(STORAGE_KEYS.SUBTITLE_ENABLED, next);
                  }
                }}
              >
                {subtitleLoading ? "CC …" : subtitleUrl ? (subtitleEnabled ? "CC On" : "CC Off") : "CC N/A"}
              </button>
              {subtitleUrl && (
                <button
                  className="subtitle-lang-btn tv-focusable"
                  tabIndex={0}
                  onClick={() => setShowLangPicker((v) => !v)}
                >
                  {SUBTITLE_LANGUAGES.find((l) => l.code === subtitleLang)?.label || subtitleLang}
                </button>
              )}
              {showLangPicker && (
                <div className="subtitle-lang-picker">
                  {SUBTITLE_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      className={`subtitle-lang-option tv-focusable${l.code === subtitleLang ? " selected" : ""}`}
                      tabIndex={0}
                      onClick={() => {
                        setSubtitleLang(l.code);
                        getCurrentPStore().set(STORAGE_KEYS.SUBTITLE_LANG, l.code);
                        setShowLangPicker(false);
                        setSubtitleUrl(null);
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showSkipIntro && introSkipMode === "prompt" && (
            <button
              className="skip-intro-btn tv-focusable"
              tabIndex={0}
              onClick={() => {
                if (videoRef.current && skipIntroSegment) {
                  videoRef.current.currentTime = skipIntroSegment.endTime;
                }
                setShowSkipIntro(false);
              }}
            >
              Skip Intro →
            </button>
          )}

          {hasNextEp && upNextCountdown === null && (
            <button className="next-ep-btn tv-focusable" tabIndex={0} onClick={playNextEp}>
              Next: E{nextEp.episode_number} →
            </button>
          )}

          {episodeList.length > 1 && (
            <button className="ep-list-toggle-btn tv-focusable" tabIndex={0} onClick={() => setShowEpList((v) => !v)}>
              ☰ Episodes
            </button>
          )}

          <button className="tv-player-close tv-focusable" tabIndex={0} onClick={onClose}>
            ✕ Close
          </button>

          {UpNextOverlay}
          {EpListOverlay}
        </div>
      )}

      {/* ── Iframe embed player ──────────────────────────────────────────── */}
      {mode === "iframe" && (
        <div className="tv-iframe-wrap">
          {PLAYER_SOURCES.length > 1 && (
            <div className="source-picker-bar">
              {PLAYER_SOURCES.map((src) => (
                <button
                  key={src.id}
                  className={`tv-btn source-picker-btn${activeSource === src.id ? " tv-btn-primary" : " tv-btn-ghost"}`}
                  tabIndex={0}
                  onClick={() => handleSourceChange(src.id)}
                >
                  {src.label}
                  {src.note && <span className="source-picker-note">({src.note})</span>}
                </button>
              ))}
            </div>
          )}
          {/* Browser fallback only — on APK the overlay WebView handles rendering */}
          {!window.RushFlixBridge && (
            <iframe
              ref={iframeRef}
              className="tv-iframe"
              src={url}
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
              onLoad={handleIframeLoad}
            />
          )}

          {hasNextEp && (
            <button
              className="next-ep-btn tv-focusable"
              tabIndex={0}
              onClick={() => {
                onProgress?.(100);
                playNextEp();
              }}
            >
              Next: E{nextEp.episode_number} →
            </button>
          )}

          {episodeList.length > 1 && (
            <button className="ep-list-toggle-btn tv-focusable" tabIndex={0} onClick={() => setShowEpList((v) => !v)}>
              ☰ Episodes
            </button>
          )}

          <button className="tv-player-close tv-focusable" tabIndex={0} onClick={onClose}>
            ✕ Close
          </button>

          {EpListOverlay}
        </div>
      )}
    </div>
  );
}
