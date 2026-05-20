import { useState, useEffect, useRef, useCallback } from "react";
import { tmdbFetch, imgUrl } from "../utils/api";
import { SearchIcon, CloseIcon } from "./Icons";
import { getCurrentPStore } from "../utils/storage";

const HISTORY_KEY = "searchHistory";
const MAX_HISTORY = 12;

function loadHistory() {
  return getCurrentPStore().get(HISTORY_KEY) || [];
}

function saveHistory(history) {
  getCurrentPStore().set(HISTORY_KEY, history);
}

export default function SearchModal({ apiKey, onSelect, onClose, offline, personalMedia = [], friendsMedia = [] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const inputRef = useRef();
  const boxRef = useRef();

  const localResults = useCallback((q) => {
    if (q.length < 2) return [];
    const lower = q.toLowerCase();
    const all = [
      ...personalMedia.map((i) => ({ ...i, _source: "personal" })),
      ...friendsMedia.map((i) => ({ ...i, _source: "friends" })),
    ];
    return all.filter((i) => (i.title || i.name || "").toLowerCase().includes(lower)).slice(0, 6);
  }, [personalMedia, friendsMedia]);

  // Focus input on open
  useEffect(() => {
    const tid = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(tid);
  }, []);

  // Debounced TMDB search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let mounted = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await tmdbFetch(
          `/search/multi?query=${encodeURIComponent(query)}&page=1`,
          apiKey,
        );
        if (mounted) {
          setResults(
            (data.results || [])
              .filter((r) => r.media_type !== "person")
              .slice(0, 12),
          );
        }
      } catch {}
      if (mounted) setLoading(false);
    }, 380);
    return () => { mounted = false; clearTimeout(timer); };
  }, [query, apiKey]);

  // D-pad trap: fully contains focus inside the modal.
  // Down/Up: cycle input → results → history items (X button excluded from vertical).
  // Right from input: move to X button. Left from X: return to input.
  useEffect(() => {
    const handler = (e) => {
      const box = boxRef.current;
      if (!box) return;

      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return; }

      const active = document.activeElement;
      const closeBtn = box.querySelector("[data-search-close]");

      if (e.key === "ArrowRight") {
        // Right from input → X button
        if (active === inputRef.current && closeBtn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeBtn.focus();
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        // Left from X button → back to input
        if (active === closeBtn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          inputRef.current?.focus();
        }
        return;
      }

      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      // Vertical cycle: input + data-focusable items only (excludes X / Clear / Remove buttons)
      const items = Array.from(
        box.querySelectorAll('[data-focusable], input')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const idx = items.indexOf(active);
      if (e.key === "ArrowDown") {
        (items[idx + 1] ?? items[0]).focus();
      } else {
        (items[idx - 1] ?? items[items.length - 1]).focus();
      }
    };
    window.addEventListener("keydown", handler, true); // capture phase — beats lrud-spatial
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const addToHistory = useCallback((term) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((e, term) => {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => h !== term);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const handleSelect = (r) => {
    const trimmed = query.trim();
    if (trimmed) {
      const next = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
      saveHistory(next);
      setHistory(next);
    }
    onSelect(r);
    onClose();
  };

  const handleHistoryClick = useCallback((term) => {
    setQuery(term);
    inputRef.current?.focus();
  }, []);

  const handleKey = (e) => {
    if (e.key === "Enter" && query.trim()) addToHistory(query);
  };

  const showHistory = !query && history.length > 0;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="search-box" ref={boxRef}>
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search movies and series..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          {query ? (
            <button className="btn btn-ghost btn-icon" data-search-close onClick={() => setQuery("")}>
              <CloseIcon />
            </button>
          ) : (
            <button className="btn btn-ghost btn-icon" data-search-close onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="search-results">
          {offline && (
            <div style={{ padding: "12px 20px", background: "rgba(255,165,0,0.1)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "#ff9800", display: "flex", alignItems: "center", gap: 8 }}>
              🌐 No internet, search is unavailable offline.
            </div>
          )}

          {!offline && loading && (
            <div className="loader"><div className="spinner" /></div>
          )}

          {!loading && query && results.length === 0 && localResults(query).length === 0 && (
            <div className="search-empty">No results for "{query}"</div>
          )}

          {query.length >= 2 && localResults(query).length > 0 && (
            <div className="search-local-section">
              <div className="search-local-label">Your Media</div>
              {localResults(query).map((r) => (
                <div
                  key={r.id}
                  className="search-result"
                  tabIndex={0}
                  data-focusable
                  onClick={() => handleSelect(r)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelect(r)}
                >
                  <div className="search-result-thumb-placeholder" />
                  <div className="search-result-info">
                    <div className="search-result-title">{r.title || r.name}</div>
                    <div className="search-result-meta">{r.year || ""}</div>
                  </div>
                  <span className="search-result-type" style={{ background: "rgba(120,80,220,0.18)", color: "#a78bfa" }}>
                    {r._source === "friends" ? "Friend" : "Personal"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && results.map((r) => (
            <div
              key={r.id}
              className="search-result"
              tabIndex={0}
              data-focusable
              onClick={() => handleSelect(r)}
              onKeyDown={(e) => e.key === "Enter" && handleSelect(r)}
            >
              <img
                src={
                  r.poster_path
                    ? imgUrl(r.poster_path, "w92")
                    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='58'%3E%3Crect fill='%23222' width='40' height='58'/%3E%3C/svg%3E"
                }
                alt=""
              />
              <div className="search-result-info">
                <div className="search-result-title">{r.title || r.name}</div>
                <div className="search-result-meta">
                  {(r.release_date || r.first_air_date || "").slice(0, 4)}
                  {r.vote_average ? ` · ★ ${r.vote_average.toFixed(1)}` : ""}
                </div>
              </div>
              <span className={`search-result-type ${r.media_type === "tv" ? "type-tv" : "type-movie"}`}>
                {r.media_type === "tv" ? "Series" : "Movie"}
              </span>
            </div>
          ))}

          {showHistory && (
            <div className="search-history">
              <div className="search-history-header">
                <span className="search-history-label">Recent searches</span>
                <button className="search-history-clear" onClick={clearHistory}>
                  Clear all
                </button>
              </div>
              {history.map((term) => (
                <div
                  key={term}
                  className="search-history-item"
                  tabIndex={0}
                  data-focusable
                  onClick={() => handleHistoryClick(term)}
                  onKeyDown={(e) => e.key === "Enter" && handleHistoryClick(term)}
                >
                  <span className="search-history-icon"><SearchIcon /></span>
                  <span className="search-history-term">{term}</span>
                  <button
                    className="search-history-remove"
                    onClick={(e) => removeFromHistory(e, term)}
                    title="Remove"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!query && history.length === 0 && (
            <div className="search-hint">
              Search for movies and series &nbsp;·&nbsp; <kbd>ESC</kbd> to close
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
