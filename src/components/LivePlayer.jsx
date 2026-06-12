import { useState, useEffect, useRef, useCallback } from "react";

export default function LivePlayer({ channel, channels, onClose }) {
  const videoRef  = useRef(null);
  const hideTimer = useRef(null);

  const [showOverlay, setShowOverlay] = useState(true);
  const [paused,      setPaused]      = useState(false);
  const [buffering,   setBuffering]   = useState(true);
  const [error,       setError]       = useState(false);
  const [idx,         setIdx]         = useState(() => channels.indexOf(channel));

  const currentChannel = channels[idx] ?? channel;

  const resetOverlay = useCallback(() => {
    setShowOverlay(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowOverlay(false), 3500);
  }, []);

  useEffect(() => {
    resetOverlay();
    return () => clearTimeout(hideTimer.current);
  }, [resetOverlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setError(false);
    setBuffering(true);
    v.src = currentChannel.url;
    v.load();
    v.play().catch(() => {});
    resetOverlay();
  }, [currentChannel.url, resetOverlay]);

  const goNext = useCallback(() => {
    setIdx((i) => (i + 1) % channels.length);
  }, [channels.length]);

  const goPrev = useCallback(() => {
    setIdx((i) => (i - 1 + channels.length) % channels.length);
  }, [channels.length]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); }
    else          { v.pause();                setPaused(true);  }
    resetOverlay();
  }, [resetOverlay]);

  // Capture-phase listener overrides tvNav.js
  useEffect(() => {
    const handle = (e) => {
      switch (e.key) {
        case "ArrowLeft":
        case "MediaRewind":
          goPrev(); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowRight":
        case "MediaFastForward":
          goNext(); e.preventDefault(); e.stopPropagation(); break;
        case " ":
        case "Enter":
        case "MediaPlay":
        case "MediaPause":
        case "MediaPlayPause":
          togglePlay(); e.preventDefault(); e.stopPropagation(); break;
        case "ArrowUp":
        case "ArrowDown":
          resetOverlay(); e.preventDefault(); e.stopPropagation(); break;
        case "Escape":
        case "Backspace":
        case "GoBack":
          onClose(); e.preventDefault(); e.stopPropagation(); break;
        default: break;
      }
    };
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [goPrev, goNext, togglePlay, resetOverlay, onClose]);

  const onWaiting  = () => setBuffering(true);
  const onPlaying  = () => { setBuffering(false); setPaused(false); };
  const onPause    = () => setPaused(true);
  const onError    = () => { setBuffering(false); setError(true); };

  const prevCh = channels[(idx - 1 + channels.length) % channels.length];
  const nextCh = channels[(idx + 1) % channels.length];

  return (
    <div className="live-player-wrap" onClick={resetOverlay}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="live-player-video"
        onWaiting={onWaiting}
        onPlaying={onPlaying}
        onPause={onPause}
        onError={onError}
        onCanPlay={() => setBuffering(false)}
      />

      {buffering && !error && (
        <div className="live-player-spinner">
          <div className="live-spinner-ring" />
        </div>
      )}

      {error && (
        <div className="live-player-error">
          <p>Stream unavailable</p>
          <p className="live-player-error-sub">← Prev channel  |  Next channel →</p>
        </div>
      )}

      <div className={`live-player-overlay${showOverlay ? "" : " hidden"}`}>
        <div className="live-overlay-top">
          {currentChannel.logo && (
            <img
              src={currentChannel.logo}
              alt=""
              className="live-overlay-logo"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div>
            <div className="live-overlay-name">{currentChannel.name}</div>
            <div className="live-overlay-badge">● LIVE</div>
          </div>
          {paused && <div className="live-overlay-paused">⏸ PAUSED</div>}
        </div>

        <div className="live-overlay-bottom">
          <div className="live-overlay-adjacent prev">
            <span className="live-overlay-adj-label">◀ Previous</span>
            <span className="live-overlay-adj-name">{prevCh.name}</span>
          </div>
          <div className="live-overlay-adjacent next">
            <span className="live-overlay-adj-label">Next ▶</span>
            <span className="live-overlay-adj-name">{nextCh.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
