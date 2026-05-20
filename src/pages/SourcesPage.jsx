import { useState, useRef, useCallback } from "react";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { BackIcon, TrashIcon } from "../components/Icons";
import { getPublicDomainMeta, clearPublicDomainCache, fetchPublicDomainMovies } from "../utils/archiveOrg";
import { fetchJsonCatalogue, clearCatalogueCache, getCatalogueMeta } from "../utils/jsonCatalogue";

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeShareCode(list) {
  try {
    const slim = list.slice(0, 30).map(({ id, title, poster_path, media_type, year }) => ({
      id, title, poster_path, media_type, year,
    }));
    return btoa(JSON.stringify(slim));
  } catch { return ""; }
}

function decodeShareCode(code) {
  try {
    const parsed = JSON.parse(atob(code.trim()));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return null; }
}

const CAT_INVITE_PREFIX = "rfcat_";

function encodeCatalogueInvite(url) {
  try { return CAT_INVITE_PREFIX + btoa(url); } catch { return ""; }
}

function decodeCatalogueInvite(code) {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith(CAT_INVITE_PREFIX)) return null;
    const url = atob(trimmed.slice(CAT_INVITE_PREFIX.length));
    return url.startsWith("http://") || url.startsWith("https://") ? url : null;
  } catch { return null; }
}

// ── Section: Custom Sources ────────────────────────────────────────────────────
function CustomSourcesSection({ isAdmin }) {
  const [sources, setSources] = useState(() => storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {});
  const [testStatus, setTestStatus] = useState({}); // key → "testing"|"ok"|"error"

  function deleteSource(key) {
    const next = { ...sources };
    delete next[key];
    storage.set(STORAGE_KEYS.CUSTOM_SOURCES, next);
    setSources(next);
  }
  function clearAll() {
    storage.set(STORAGE_KEYS.CUSTOM_SOURCES, {});
    setSources({});
  }
  async function testUrl(key, url) {
    setTestStatus((s) => ({ ...s, [key]: "testing" }));
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000), mode: "no-cors" });
      setTestStatus((s) => ({ ...s, [key]: "ok" }));
    } catch {
      setTestStatus((s) => ({ ...s, [key]: "error" }));
    }
  }

  const entries = Object.entries(sources);
  return (
    <div className="sources-section">
      <div className="sources-section-header">
        <h3 className="sources-section-title">Saved Video URLs <span className="source-count-badge">{entries.length}</span></h3>
        {isAdmin && entries.length > 0 && (
          <button className="tv-btn tv-btn-ghost tv-focusable sources-clear-btn" tabIndex={0} onClick={clearAll}>
            Clear All
          </button>
        )}
      </div>
      <p className="sources-hint">URLs saved when you play content using a direct link.{isAdmin ? " Delete any that are no longer valid." : " Ask an admin to remove entries."}</p>
      {entries.length === 0 && <p className="sources-empty">No saved URLs yet. Play any content and enter a URL to save one.</p>}
      <div className="sources-list">
        {entries.map(([key, url]) => {
          const ts = testStatus[key];
          return (
            <div key={key} className="source-row">
              <div className="source-row-info">
                <div className="source-row-key">
                  {ts && <span className={`source-status-dot ${ts === "ok" ? "ok" : ts === "error" ? "err" : "testing"}`} />}
                  {key.replace(/_/g, " ").replace(/^(movie|tv|custom) /, "")}
                </div>
                <div className="source-row-url">{url}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="tv-btn tv-btn-ghost tv-focusable"
                  tabIndex={0}
                  onClick={() => testUrl(key, url)}
                  disabled={ts === "testing"}
                  style={{ fontSize: 13, padding: "6px 12px" }}
                >
                  {ts === "testing" ? "…" : "Test"}
                </button>
                {isAdmin && (
                  <button className="tv-btn tv-btn-ghost tv-focusable icon-btn" tabIndex={0} onClick={() => deleteSource(key)}>
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Personal Media item form (add + edit) ────────────────────────────────────
function PersonalMediaForm({ initial, onSave, onCancel, submitLabel }) {
  const [title, setTitle]       = useState(initial?.title || "");
  const [year, setYear]         = useState(initial?.year || "");
  const [streamUrl, setStreamUrl] = useState(initial?.streamUrl || "");
  const [posterUrl, setPosterUrl] = useState(initial?.posterUrl || "");
  const [overview, setOverview] = useState(initial?.overview || "");
  const [mediaType, setMediaType] = useState(initial?.media_type || "movie");
  const [error, setError]       = useState("");
  const titleRef = useRef(null);

  function handleSave() {
    if (!title.trim()) { setError("Title required"); return; }
    onSave({ title: title.trim(), year: year.trim(), streamUrl: streamUrl.trim(), posterUrl: posterUrl.trim(), overview: overview.trim(), media_type: mediaType });
  }

  return (
    <div className="pm-form">
      <input ref={titleRef} autoFocus className="tv-input pm-input" placeholder="Title *" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} />
      <div style={{ display: "flex", gap: 8 }}>
        <input className="tv-input pm-input pm-input-sm" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        <select className="tv-input pm-input pm-input-sm" value={mediaType} onChange={(e) => setMediaType(e.target.value)} style={{ flex: 1 }}>
          <option value="movie">Movie</option>
          <option value="tv">TV / Series</option>
        </select>
      </div>
      <input className="tv-input pm-input" type="url" placeholder="Stream URL (optional)" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} />
      <input className="tv-input pm-input" type="url" placeholder="Poster image URL (optional)" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
      <textarea className="tv-input pm-input" placeholder="Overview / description (optional)" value={overview} onChange={(e) => setOverview(e.target.value)} rows={2} style={{ resize: "vertical" }} />
      {error && <p className="pm-error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={handleSave}>{submitLabel}</button>
        {onCancel && <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ── Section: Personal Media ────────────────────────────────────────────────────
function PersonalMediaSection({ personalMedia, onUpdate, isAdmin }) {
  const [editingId, setEditingId] = useState(null);

  function addItem(fields) {
    const item = {
      id: `custom_${Date.now()}`,
      title: fields.title,
      year: fields.year,
      release_date: fields.year ? `${fields.year}-01-01` : "",
      overview: fields.overview,
      media_type: fields.media_type,
      isCustom: true,
      streamUrl: fields.streamUrl,
      posterUrl: fields.posterUrl,
      poster_path: null,
      vote_average: 0,
    };
    if (fields.streamUrl) {
      const saved = storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {};
      saved[`custom_${item.id}`] = fields.streamUrl;
      storage.set(STORAGE_KEYS.CUSTOM_SOURCES, saved);
    }
    onUpdate([item, ...personalMedia]);
  }

  function saveEdit(id, fields) {
    onUpdate(personalMedia.map((m) => {
      if (m.id !== id) return m;
      const updated = { ...m, title: fields.title, year: fields.year, release_date: fields.year ? `${fields.year}-01-01` : "", overview: fields.overview, media_type: fields.media_type, streamUrl: fields.streamUrl, posterUrl: fields.posterUrl };
      if (fields.streamUrl) {
        const saved = storage.get(STORAGE_KEYS.CUSTOM_SOURCES) || {};
        saved[`custom_${id}`] = fields.streamUrl;
        storage.set(STORAGE_KEYS.CUSTOM_SOURCES, saved);
      }
      return updated;
    }));
    setEditingId(null);
  }

  function removeItem(id) {
    onUpdate(personalMedia.filter((m) => m.id !== id));
  }

  return (
    <div className="sources-section">
      <h3 className="sources-section-title">Personal Media</h3>
      <p className="sources-hint">Add your own movies, home videos, or private streams. They appear in the Personal Media row on the home screen.</p>

      {isAdmin ? (
        <PersonalMediaForm submitLabel="Add to Library" onSave={addItem} />
      ) : (
        <p className="sources-hint">Only the admin can add or remove personal media.</p>
      )}

      {personalMedia.length > 0 && (
        <div className="sources-list">
          {personalMedia.map((item) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="source-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <PersonalMediaForm
                    initial={item}
                    submitLabel="Save Changes"
                    onSave={(fields) => saveEdit(item.id, fields)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="source-row">
                  <div className="source-row-info">
                    <div className="source-row-key">{item.title}{item.year ? ` (${item.year})` : ""} <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>{item.media_type === "tv" ? "TV" : "Movie"}</span></div>
                    <div className="source-row-url">{item.streamUrl || "No URL saved"}</div>
                    {item.overview && <div className="source-row-url" style={{ marginTop: 2, fontStyle: "italic" }}>{item.overview.slice(0, 80)}{item.overview.length > 80 ? "…" : ""}</div>}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => setEditingId(item.id)}>Edit</button>
                      <button className="tv-btn tv-btn-ghost tv-focusable icon-btn" tabIndex={0} onClick={() => removeItem(item.id)}><TrashIcon /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section: Shared Library ────────────────────────────────────────────────────
function SharedLibrarySection({ sharedLibrary, onUpdate, savedList, isAdmin }) {
  const savedIds = new Set(sharedLibrary.map((i) => `${i.media_type}_${i.id}`));

  function toggleItem(item) {
    const key = `${item.media_type}_${item.id}`;
    if (savedIds.has(key)) {
      onUpdate(sharedLibrary.filter((i) => `${i.media_type}_${i.id}` !== key));
    } else {
      onUpdate([...sharedLibrary, item]);
    }
  }

  function removeItem(item) {
    const key = `${item.media_type}_${item.id}`;
    onUpdate(sharedLibrary.filter((i) => `${i.media_type}_${i.id}` !== key));
  }

  return (
    <div className="sources-section">
      <h3 className="sources-section-title">Shared Library</h3>
      <p className="sources-hint">
        Items here are visible to all profiles on this device.
        {isAdmin ? " As admin, you can add or remove items." : " Only the admin can modify this list."}
      </p>

      {isAdmin && savedList.length > 0 && (
        <>
          <p className="sources-sub">Add from your watchlist:</p>
          <div className="shared-pick-grid">
            {savedList.map((item) => {
              const key = `${item.media_type}_${item.id}`;
              const inLib = savedIds.has(key);
              return (
                <button
                  key={key}
                  className={`shared-pick-btn tv-focusable ${inLib ? "in-lib" : ""}`}
                  tabIndex={0}
                  onClick={() => toggleItem(item)}
                >
                  {inLib ? "✓ " : "+ "}{item.title}
                </button>
              );
            })}
          </div>
        </>
      )}

      {sharedLibrary.length > 0 && (
        <>
          <p className="sources-sub">Currently shared:</p>
          <div className="sources-list">
            {sharedLibrary.map((item) => (
              <div key={`${item.media_type}_${item.id}`} className="source-row">
                <div className="source-row-info">
                  <div className="source-row-key">{item.title}</div>
                  <div className="source-row-url">{item.media_type === "tv" ? "Series" : "Movie"} · {item.year || ""}</div>
                </div>
                {isAdmin && (
                  <button className="tv-btn tv-btn-ghost tv-focusable icon-btn" tabIndex={0} onClick={() => removeItem(item)}>
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {sharedLibrary.length === 0 && <p className="sources-empty">Nothing shared yet.</p>}
    </div>
  );
}

// ── Section: Friends' Picks ────────────────────────────────────────────────────
function FriendsSection({ savedList, friendsMedia, onUpdateFriends }) {
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [showExport, setShowExport] = useState(false);
  const exportCode = encodeShareCode(savedList);

  function handleImport() {
    setImportError(""); setImportSuccess("");
    const items = decodeShareCode(importCode);
    if (items === null) { setImportError("Invalid code — paste the exact code your friend shared."); return; }
    if (items.length === 0) { setImportError("Code contains no items."); return; }
    onUpdateFriends(items);
    setImportCode("");
    setImportSuccess(`Imported ${items.length} item${items.length !== 1 ? "s" : ""}!`);
  }

  function clearFriends() {
    onUpdateFriends([]);
    setImportSuccess("");
  }

  return (
    <div className="sources-section">
      <h3 className="sources-section-title">Friends' Picks</h3>
      <p className="sources-hint">Share your watchlist with a friend or import theirs. Works offline — just a simple code.</p>

      <div className="friends-block">
        <h4 className="friends-sub-title">Share My Watchlist</h4>
        {savedList.length === 0 && <p className="sources-empty">Your watchlist is empty — nothing to share yet.</p>}
        {savedList.length > 0 && (
          <>
            <button
              className="tv-btn tv-btn-ghost tv-focusable"
              tabIndex={0}
              onClick={() => setShowExport((v) => !v)}
            >
              {showExport ? "Hide Code" : "Show My Share Code"}
            </button>
            {showExport && (
              <textarea
                className="tv-input friends-code-area"
                readOnly
                value={exportCode}
                onClick={(e) => e.target.select()}
              />
            )}
          </>
        )}
      </div>

      <div className="friends-block">
        <h4 className="friends-sub-title">Import a Friend's List</h4>
        <textarea
          className="tv-input friends-code-area"
          placeholder="Paste your friend's share code here…"
          value={importCode}
          onChange={(e) => { setImportCode(e.target.value); setImportError(""); setImportSuccess(""); }}
        />
        {importError && <p className="pm-error">{importError}</p>}
        {importSuccess && <p className="pm-success">{importSuccess}</p>}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="tv-btn tv-btn-primary tv-focusable"
            tabIndex={0}
            onClick={handleImport}
            disabled={!importCode.trim()}
          >
            Import
          </button>
          {friendsMedia.length > 0 && (
            <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={clearFriends}>
              Clear Friends' Picks
            </button>
          )}
        </div>
        {friendsMedia.length > 0 && (
          <p className="sources-hint" style={{ marginTop: 8 }}>
            Currently showing {friendsMedia.length} friend{friendsMedia.length !== 1 ? "s'" : "'s"} pick{friendsMedia.length !== 1 ? "s" : ""} on home.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section: JSON Catalogues ──────────────────────────────────────────────────
function JsonCatalogueSection({ onRefresh }) {
  const [urls, setUrls] = useState(() => storage.get(STORAGE_KEYS.JSON_CATALOGUES) || []);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [metas, setMetas] = useState(() => {
    const saved = storage.get(STORAGE_KEYS.JSON_CATALOGUES) || [];
    return Object.fromEntries(saved.map((u) => [u, getCatalogueMeta(u)]));
  });
  const [refreshing, setRefreshing] = useState({});
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(null);

  function saveUrls(next) {
    storage.set(STORAGE_KEYS.JSON_CATALOGUES, next);
    setUrls(next);
  }

  async function addUrl() {
    const url = input.trim();
    if (!url) return;
    if (urls.includes(url)) { setError("Already added."); return; }
    setError("");
    try {
      await fetchJsonCatalogue(url);
      const next = [...urls, url];
      saveUrls(next);
      setMetas((m) => ({ ...m, [url]: getCatalogueMeta(url) }));
      setInput("");
      onRefresh?.();
    } catch (e) {
      setError(`Failed to fetch: ${e.message}`);
    }
  }

  async function refreshUrl(url) {
    setRefreshing((r) => ({ ...r, [url]: true }));
    clearCatalogueCache(url);
    try {
      await fetchJsonCatalogue(url);
      setMetas((m) => ({ ...m, [url]: getCatalogueMeta(url) }));
      onRefresh?.();
    } catch {}
    setRefreshing((r) => ({ ...r, [url]: false }));
  }

  function removeUrl(url) {
    clearCatalogueCache(url);
    const next = urls.filter((u) => u !== url);
    saveUrls(next);
    setMetas((m) => { const n = { ...m }; delete n[url]; return n; });
    onRefresh?.();
  }

  async function handleInviteImport() {
    setInviteError(""); setInviteSuccess("");
    const url = decodeCatalogueInvite(inviteCode);
    if (!url) { setInviteError("Invalid invite code."); return; }
    if (urls.includes(url)) { setInviteError("Already added."); return; }
    try {
      await fetchJsonCatalogue(url);
      const next = [...urls, url];
      saveUrls(next);
      setMetas((m) => ({ ...m, [url]: getCatalogueMeta(url) }));
      setInviteCode("");
      setInviteSuccess("Catalogue added!");
      onRefresh?.();
    } catch (e) {
      setInviteError(`Failed to fetch: ${e.message}`);
    }
  }

  function copyInvite(url) {
    const code = encodeCatalogueInvite(url);
    navigator.clipboard.writeText(code).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1800);
    });
  }

  return (
    <div className="sources-section">
      <h3 className="sources-section-title">JSON Catalogues <span className="source-count-badge">{urls.length}</span></h3>
      <p className="sources-hint">
        Host a JSON file anywhere and paste its URL here. Rush Flix fetches and caches it for 24h.
        Format: <code>[{"{"}"title":"Movie Name","streamUrl":"https://…","year":2020{"}"}</code>]
      </p>
      <div className="pm-form">
        <input
          className="tv-input pm-input"
          type="url"
          placeholder="https://yourserver.com/catalogue.json"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
        />
        {error && <p className="pm-error">{error}</p>}
        <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={addUrl}>
          Add Catalogue
        </button>
      </div>

      {/* Invite code import */}
      <div className="friends-block" style={{ marginTop: 16 }}>
        <h4 className="friends-sub-title">Import via Invite Code</h4>
        <p className="sources-hint">If someone shared a catalogue invite code, paste it here.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="tv-input pm-input"
            placeholder="rfcat_… invite code"
            value={inviteCode}
            onChange={(e) => { setInviteCode(e.target.value); setInviteError(""); setInviteSuccess(""); }}
            style={{ flex: 1 }}
          />
          <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={handleInviteImport} disabled={!inviteCode.trim()}>
            Import
          </button>
        </div>
        {inviteError && <p className="pm-error">{inviteError}</p>}
        {inviteSuccess && <p className="pm-success">{inviteSuccess}</p>}
      </div>

      {urls.length === 0 && <p className="sources-empty">No catalogues added yet.</p>}
      <div className="sources-list">
        {urls.map((url) => {
          const meta = metas[url] || { count: 0, lastScanned: null, status: "stale" };
          const isRefreshing = refreshing[url];
          return (
            <div key={url} className="source-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 8 }}>
                <span className={`source-status-dot ${meta.status === "ok" ? "ok" : "err"}`} />
                <div className="source-row-info" style={{ flex: 1 }}>
                  <div className="source-row-url" style={{ wordBreak: "break-all" }}>{url}</div>
                  <div className="source-row-key">{meta.count} items · {fmtDate(meta.lastScanned)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="tv-btn tv-btn-ghost tv-focusable source-refresh-btn"
                    tabIndex={0}
                    onClick={() => copyInvite(url)}
                    style={{ fontSize: 13 }}
                  >
                    {copiedUrl === url ? "Copied!" : "Share"}
                  </button>
                  <button
                    className="tv-btn tv-btn-ghost tv-focusable source-refresh-btn"
                    tabIndex={0}
                    onClick={() => refreshUrl(url)}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "…" : "Refresh"}
                  </button>
                  <button className="tv-btn tv-btn-ghost tv-focusable icon-btn" tabIndex={0} onClick={() => removeUrl(url)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "custom",    label: "Video URLs" },
  { id: "personal",  label: "Personal Media" },
  { id: "shared",    label: "Shared Library" },
  { id: "friends",   label: "Friends' Picks" },
  { id: "catalogue", label: "JSON Catalogues" },
];

function fmtDate(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function SourcesPage({
  savedList = [],
  sharedLibrary = [],
  onUpdateSharedLibrary,
  personalMedia = [],
  onUpdatePersonalMedia,
  friendsMedia = [],
  onUpdateFriendsMedia,
  activeProfile,
  onRefreshPublicDomain,
}) {
  const [tab, setTab] = useState("custom");
  const [archiveMeta, setArchiveMeta] = useState(() => getPublicDomainMeta());
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = activeProfile?.isAdmin ?? false;

  async function handleRefreshArchive() {
    if (refreshing) return;
    setRefreshing(true);
    clearPublicDomainCache();
    try {
      await fetchPublicDomainMovies();
      onRefreshPublicDomain?.();
    } catch {}
    setArchiveMeta(getPublicDomainMeta());
    setRefreshing(false);
  }

  const statusColor = archiveMeta.status === "ok" ? "#4ade80" : archiveMeta.status === "stale" ? "#facc15" : "#f87171";

  return (
    <div className="sources-page fade-in">
      <div className="sources-page-header">
        <h2 className="sources-page-title">Sources & Media</h2>
        <p className="sources-page-sub">Manage video URLs, personal content, shared library, and friends.</p>
      </div>

      {/* Archive.org status bar */}
      <div className="source-status-bar">
        <span className="source-status-dot" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
        <span className="source-status-label">Free to Watch (archive.org)</span>
        <span className="source-status-meta">{archiveMeta.count} items · Last scanned {fmtDate(archiveMeta.lastScanned)}</span>
        {isAdmin && (
          <button
            className="tv-btn tv-btn-ghost tv-focusable source-refresh-btn"
            tabIndex={0}
            onClick={handleRefreshArchive}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <div className="season-tabs sources-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`season-tab tv-focusable ${tab === t.id ? "active" : ""}`}
            tabIndex={0}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "custom"   && <CustomSourcesSection isAdmin={isAdmin} />}
      {tab === "personal" && <PersonalMediaSection personalMedia={personalMedia} onUpdate={onUpdatePersonalMedia} isAdmin={isAdmin} />}
      {tab === "shared"   && (
        <SharedLibrarySection
          sharedLibrary={sharedLibrary}
          onUpdate={onUpdateSharedLibrary}
          savedList={savedList}
          isAdmin={isAdmin}
        />
      )}
      {tab === "friends"  && (
        <FriendsSection
          savedList={savedList}
          friendsMedia={friendsMedia}
          onUpdateFriends={onUpdateFriendsMedia}
        />
      )}
      {tab === "catalogue" && isAdmin && (
        <JsonCatalogueSection onRefresh={onRefreshPublicDomain} />
      )}
      {tab === "catalogue" && !isAdmin && (
        <p className="sources-hint" style={{ padding: "24px 0" }}>Only the admin can manage JSON catalogues.</p>
      )}
    </div>
  );
}
