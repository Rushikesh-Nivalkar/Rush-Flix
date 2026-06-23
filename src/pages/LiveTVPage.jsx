import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import LivePlayer from "../components/LivePlayer";
import {
  fetchChannels, fetchChannelsByCountry,
  fetchChannelsMeta, fetchGuidesJson, enrichChannels,
} from "../utils/m3uParser";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { SearchIcon } from "../components/Icons";

export default function LiveTVPage({ offline, countryFilter }) {
  const hideNsfw = !!storage.get(STORAGE_KEYS.LIVE_TV_HIDE_NSFW);

  const [channels,      setChannels]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [guidesMap,     setGuidesMap]     = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [searchQuery,   setSearchQuery]   = useState("");

  const navZoneRef        = useRef("sidebar");
  const sidebarRef        = useRef(null);
  const panelRef          = useRef(null);
  const searchInputRef    = useRef(null);
  const lastChannelIdxRef = useRef(0);

  useEffect(() => {
    if (offline) { setLoading(false); setError("Live TV unavailable offline."); return; }
    setLoading(true);
    setError(null);

    const fetcher     = countryFilter ? fetchChannelsByCountry(countryFilter) : fetchChannels();
    const metaFetch   = hideNsfw ? fetchChannelsMeta().catch(() => null) : Promise.resolve(null);
    const guidesFetch = fetchGuidesJson().catch(() => null);

    Promise.all([fetcher, metaFetch, guidesFetch])
      .then(([ch, meta, guides]) => {
        setChannels(meta ? enrichChannels(ch, meta) : ch);
        setGuidesMap(guides);
        setLoading(false);
      })
      .catch(() => { setError("Could not load channels. Check your connection."); setLoading(false); });
  }, [offline, countryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedChannels = useMemo(() => {
    const isEnglish = (lang) =>
      !!lang && lang.split(";").some((l) => l.trim().toLowerCase() === "english");
    const base = hideNsfw ? channels.filter((ch) => !ch.isNsfw) : channels;
    const tagged = guidesMap
      ? base.map((ch) => ({ ...ch, hasEpg: !!(ch.tvgId && guidesMap.has(ch.tvgId)) }))
      : base;
    const en = [], other = [];
    for (const ch of tagged) { (isEnglish(ch.language) ? en : other).push(ch); }
    return [...en, ...other];
  }, [channels, hideNsfw, guidesMap]);

  const groups = useMemo(
    () => [...new Set(sortedChannels.map((c) => c.group))].sort(),
    [sortedChannels],
  );

  useEffect(() => {
    if (groups.length === 0) return;
    if (!selectedGroup || !groups.includes(selectedGroup)) setSelectedGroup(groups[0]);
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (groups.length > 0) sidebarRef.current?.querySelector(".live-tv-group-btn")?.focus();
  }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupChannels = useMemo(
    () => (selectedGroup ? sortedChannels.filter((c) => c.group === selectedGroup).slice(0, 50) : []),
    [sortedChannels, selectedGroup],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return sortedChannels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 100);
  }, [sortedChannels, searchQuery]);

  const displayChannels = searchResults !== null ? searchResults : groupChannels;
  useEffect(() => { lastChannelIdxRef.current = 0; }, [searchQuery]);

  const getPanelFocusables = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll("button:not([disabled])"))
      .filter((el) => el.offsetParent !== null);
  }, []);

  const getGridNav = useCallback((focusables, ci, direction) => {
    if (!focusables.length) return null;
    if (ci < 0) return direction === "up" || direction === "left" ? "sidebar" : null;
    const firstTop = focusables[0].offsetTop;
    let cols = 0;
    for (const el of focusables) {
      if (Math.abs(el.offsetTop - firstTop) <= 2) cols++; else break;
    }
    if (cols < 1) cols = 1;
    if (direction === "right") return focusables[ci + 1] || null;
    if (direction === "left")  return ci % cols === 0 ? "sidebar" : focusables[ci - 1] || null;
    if (direction === "down")  return focusables[ci + cols] || null;
    if (direction === "up") {
      const prev = ci - cols;
      return prev < 0 ? "search" : focusables[prev] || null;
    }
    return null;
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (window.__livePlayerActive) return;
      const zone = navZoneRef.current;

      if (zone === "sidebar") {
        const btns = sidebarRef.current
          ? Array.from(sidebarRef.current.querySelectorAll(".live-tv-group-btn"))
          : [];
        if (!btns.length) return;
        const ci = btns.indexOf(document.activeElement);
        if (e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          const next = ci < 0 ? 0 : ci + 1 < btns.length ? ci + 1 : 0;
          btns[next].focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault(); e.stopPropagation();
          if (ci > 0) btns[ci - 1].focus();
        } else if (e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          navZoneRef.current = "panel";
          getPanelFocusables()[0]?.focus();
        }
        return;
      }

      // panel zone
      if (document.activeElement === searchInputRef.current) {
        if (e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          getPanelFocusables()[0]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault(); e.stopPropagation();
          navZoneRef.current = "sidebar";
          sidebarRef.current?.querySelector(".live-tv-group-btn")?.focus();
        }
        return;
      }

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
        if (t === "search") searchInputRef.current?.focus();
        else if (t) t.focus();
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
      <div className="live-tv-main">
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
            >{group}</button>
          ))}
        </div>

        <div className="live-tv-panel" ref={panelRef}>
          <div className="live-tv-search-bar">
            <div className="search-input-wrap">
              <SearchIcon size={18} style={{ position:"absolute",left:"0.9rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-dim)",pointerEvents:"none" }} />
              <input
                ref={searchInputRef}
                className="search-input"
                style={{ paddingLeft:"2.6rem" }}
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
                  {searchResults !== null ? `No channels match "${searchQuery}".` : "No channels for this genre."}
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
                        {ch.logo
                          ? <img src={ch.logo} alt={ch.name} className="channel-logo" onError={(e) => { e.target.style.display="none"; }} />
                          : <div className="channel-logo-placeholder">📺</div>}
                      </div>
                      <div className="channel-name">{ch.name}</div>
                      <div className="channel-live-badge">
                        {ch.hasEpg && <span className="channel-epg-badge">📅</span>}
                        ● LIVE
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
