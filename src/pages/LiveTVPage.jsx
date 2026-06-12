import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import LivePlayer from "../components/LivePlayer";
import { fetchChannels, fetchChannelsByCountry } from "../utils/m3uParser";
import { SearchIcon } from "../components/Icons";

export default function LiveTVPage({ offline, countryFilter }) {
  const [channels,      setChannels]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [searchQuery,   setSearchQuery]   = useState("");

  // ── Two-zone nav refs (matches Settings page pattern) ─────────────────────
  const navZoneRef        = useRef("sidebar"); // "sidebar" | "panel"
  const sidebarRef        = useRef(null);
  const panelRef          = useRef(null);
  const searchInputRef    = useRef(null);
  const lastChannelIdxRef = useRef(0);         // index of last-clicked card for focus restore

  useEffect(() => {
    if (offline) { setLoading(false); setError("Live TV unavailable offline."); return; }
    setLoading(true);
    setError(null);
    setSelectedGroup(null);
    const fetcher = countryFilter ? fetchChannelsByCountry(countryFilter) : fetchChannels();
    fetcher
      .then((ch) => { setChannels(ch); setLoading(false); })
      .catch(()  => { setError("Could not load channels. Check your connection."); setLoading(false); });
  }, [offline, countryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(
    () => [...new Set(channels.map((c) => c.group))].sort(),
    [channels],
  );

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) setSelectedGroup(groups[0]);
  }, [groups, selectedGroup]);

  // Focus first sidebar button once groups load
  useEffect(() => {
    if (groups.length > 0) {
      sidebarRef.current?.querySelector(".live-tv-group-btn")?.focus();
    }
  }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupChannels = useMemo(
    () => (selectedGroup ? channels.filter((c) => c.group === selectedGroup).slice(0, 50) : []),
    [channels, selectedGroup],
  );

  // null = not searching; array = search mode (may be empty)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 100);
  }, [channels, searchQuery]);

  const displayChannels = searchResults !== null ? searchResults : groupChannels;

  // Reset focus index whenever the search query changes
  useEffect(() => {
    lastChannelIdxRef.current = 0;
  }, [searchQuery]);

  // Panel focusables — stable callback, no deps
  const getPanelFocusables = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll("button:not([disabled])"),
    ).filter((el) => el.offsetParent !== null);
  }, []);

  // 2D grid navigation — detects columns via offsetTop (layout-stable, scroll-independent)
  const getGridNav = useCallback((focusables, ci, direction) => {
    if (!focusables.length) return null;
    if (ci < 0) return direction === "up" || direction === "left" ? "sidebar" : null;

    // Count cards sharing the first card's offsetTop → that is the column count
    const firstTop = focusables[0].offsetTop;
    let cols = 0;
    for (const el of focusables) {
      if (Math.abs(el.offsetTop - firstTop) <= 2) cols++;
      else break;
    }
    if (cols < 1) cols = 1;

    if (direction === "right") return focusables[ci + 1] || null;
    if (direction === "left")  return ci % cols === 0 ? "sidebar" : focusables[ci - 1] || null;
    if (direction === "down")  return focusables[ci + cols] || null;
    if (direction === "up") {
      const prev = ci - cols;
      return prev < 0 ? "sidebar" : focusables[prev] || null;
    }
    return null;
  }, []);

  // ── D-pad two-zone handler (capture phase — overrides tvNav.js) ───────────
  useEffect(() => {
    const handler = (e) => {
      const zone = navZoneRef.current;

      if (zone === "sidebar") {
        const btns = sidebarRef.current
          ? Array.from(sidebarRef.current.querySelectorAll(".live-tv-group-btn"))
          : [];
        if (!btns.length) return;
        const ci = btns.indexOf(document.activeElement);

        if (e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          const nextIdx = ci < 0 ? 0 : ci + 1 < btns.length ? ci + 1 : 0;
          btns[nextIdx].focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault(); e.stopPropagation();
          const prevIdx = ci <= 0 ? btns.length - 1 : ci - 1;
          btns[prevIdx].focus();
        } else if (e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          navZoneRef.current = "panel";
          const focusables = getPanelFocusables();
          if (focusables[0]) focusables[0].focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault(); e.stopPropagation();
          // absorb — already in sidebar
        }
      } else {
        // Search input focus — ArrowDown enters grid; all other keys handled natively
        if (document.activeElement === searchInputRef.current) {
          if (e.key === "ArrowDown") {
            e.preventDefault(); e.stopPropagation();
            getPanelFocusables()[0]?.focus();
          }
          return; // let typing, ArrowLeft/Right, Escape pass through natively
        }

        // panel zone — 2D grid navigation
        const focusables = getPanelFocusables();
        const ci = focusables.indexOf(document.activeElement);
        if (ci < 0 && !["ArrowLeft","ArrowUp","ArrowDown","ArrowRight"].includes(e.key)) return;

        const goSidebar = () => {
          navZoneRef.current = "sidebar";
          sidebarRef.current?.querySelector(".live-tv-group-btn.active")?.focus();
        };

        if (e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          const t = getGridNav(focusables, ci, "right");
          if (t) t.focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault(); e.stopPropagation();
          const t = getGridNav(focusables, ci, "left");
          if (t === "sidebar") goSidebar(); else if (t) t.focus();
        } else if (e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          const t = getGridNav(focusables, ci, "down");
          if (t) t.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault(); e.stopPropagation();
          const t = getGridNav(focusables, ci, "up");
          if (t === "sidebar") {
            // Stop at search bar before leaving panel zone
            searchInputRef.current?.focus();
          } else if (t) {
            t.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [getPanelFocusables, getGridNav]);

  if (activeChannel) {
    return (
      <LivePlayer
        channel={activeChannel}
        channels={displayChannels}
        onClose={() => {
          setActiveChannel(null);
          setTimeout(() => {
            navZoneRef.current = "panel";
            const cards = panelRef.current?.querySelectorAll(".channel-card");
            const target = cards?.[lastChannelIdxRef.current] || cards?.[0];
            target?.focus();
          }, 50);
        }}
      />
    );
  }

  return (
    <div className="live-tv-layout">
      {/* Sidebar — genre list */}
      <div
        className="live-tv-sidebar"
        ref={sidebarRef}
        onFocus={() => { navZoneRef.current = "sidebar"; }}
      >
        <div className="live-tv-sidebar-title">Genre</div>

        {loading && <div className="live-tv-status">Loading channels…</div>}
        {error   && <div className="live-tv-status error">{error}</div>}

        {groups.map((group) => (
          <button
            key={group}
            className={`live-tv-group-btn${selectedGroup === group ? " active" : ""}`}
            tabIndex={0}
            onFocus={() => setSelectedGroup(group)}
            onClick={() => setSelectedGroup(group)}
          >
            {group}
          </button>
        ))}
      </div>

      {/* Panel — search bar + channel grid */}
      <div className="live-tv-panel" ref={panelRef}>

        {/* Search bar — reuses existing .search-input-wrap / .search-input classes */}
        <div className="live-tv-search-bar">
          <div className="search-input-wrap">
            <SearchIcon
              size={18}
              style={{
                position: "absolute", left: "0.9rem", top: "50%",
                transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none",
              }}
            />
            <input
              ref={searchInputRef}
              className="search-input"
              style={{ paddingLeft: "2.6rem" }}
              placeholder="Search channels…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { navZoneRef.current = "panel"; }}
            />
          </div>
        </div>

        {(selectedGroup || searchResults !== null) && (
          <>
            <div className="section-title">
              {searchResults !== null
                ? `${searchResults.length} channel${searchResults.length !== 1 ? "s" : ""} found`
                : selectedGroup}
            </div>

            {displayChannels.length === 0 ? (
              <div className="live-tv-status">
                {searchResults !== null
                  ? `No channels match "${searchQuery}".`
                  : "No channels for this genre."}
              </div>
            ) : (
              <div className="live-channel-grid">
                {displayChannels.map((ch, i) => (
                  <button
                    key={`${ch.tvgId || ch.name}_${i}`}
                    className="channel-card"
                    tabIndex={0}
                    onClick={() => { lastChannelIdxRef.current = i; setActiveChannel(ch); }}
                  >
                    <div className="channel-card-logo-wrap">
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="channel-logo"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <div className="channel-logo-placeholder">📺</div>
                      )}
                    </div>
                    <div className="channel-name">{ch.name}</div>
                    <div className="channel-live-badge">● LIVE</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
