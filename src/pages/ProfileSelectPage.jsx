import { useState, useRef } from "react";
import {
  getProfiles, saveProfiles, createProfile, updateProfile,
  deleteProfile, verifyPin, AVATARS,
} from "../utils/profiles";
import { profileStorage } from "../utils/storage";
import { useFocusOnMount } from "../utils/tvNav";
import { TrashIcon } from "../components/Icons";
import RushFlixLogo from "../components/RushFlixLogo";

const GUEST_PROFILE = { id: "guest", name: "Guest", avatar: "👤", isGuest: true };

// ── PIN pad (TV remote-friendly) ──────────────────────────────────────────────
function PinPad({ value, onChange, onSubmit, error }) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "⌫"];
  return (
    <div className="pin-pad">
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`pin-dot ${value.length > i ? "filled" : ""}`} />
        ))}
      </div>
      {error && <div className="pin-error">Incorrect PIN</div>}
      <div className="pin-grid">
        {digits.map((d, i) => (
          <button
            key={i}
            className={`pin-key tv-focusable ${d === null ? "pin-key-empty" : ""}`}
            tabIndex={d === null ? -1 : 0}
            disabled={d === null}
            onClick={() => {
              if (d === "⌫") { onChange(value.slice(0, -1)); return; }
              if (value.length >= 4) return;
              const next = value + d;
              onChange(next);
              if (next.length === 4) onSubmit(next);
            }}
          >
            {d !== null ? d : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Profile form (create / edit) ──────────────────────────────────────────────
function ProfileForm({ title, initial, onSave, onCancel, isFirstProfile }) {
  const [name, setName] = useState(initial?.name || "");
  const [avatar, setAvatar] = useState(initial?.avatar || AVATARS[0]);
  const [pin, setPin] = useState("");
  const [isKids, setIsKids] = useState(initial?.isKids || false);

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), avatar, pin: pin.trim() || (initial?.pin ?? null), isKids });
  }

  return (
    <div className="profile-form">
      <h2 className="profile-form-title">{title}</h2>
      <div className="avatar-picker">
        {AVATARS.map((a) => (
          <button
            key={a}
            className={`avatar-option tv-focusable ${avatar === a ? "selected" : ""}`}
            tabIndex={0}
            onClick={() => setAvatar(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="selected-avatar">{avatar}</div>
      <input
        className="tv-input"
        type="text"
        placeholder="Profile name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        autoFocus
      />
      <input
        className="tv-input"
        type="password"
        placeholder={initial ? "New PIN (leave blank to keep current)" : "PIN (optional, 4 digits)"}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
      <label className="tv-checkbox">
        <input type="checkbox" checked={isKids} onChange={(e) => setIsKids(e.target.checked)} />
        Kids profile
      </label>
      {isFirstProfile && (
        <p style={{ fontSize: 13, color: "var(--text3)", textAlign: "center" }}>
          First profile gets admin access automatically.
        </p>
      )}
      <div className="profile-form-actions">
        <button className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={handleSave}>
          {initial ? "Save" : "Create"}
        </button>
        <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfileSelectPage({ onSelectProfile }) {
  const [profiles, setProfiles] = useState(() => getProfiles());
  const [mode, setMode] = useState("select"); // select | create | pin | manage | edit
  const [pinTarget, setPinTarget] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const containerRef = useRef(null);
  useFocusOnMount(containerRef);

  const reload = () => setProfiles(getProfiles());

  // ── Select ────────────────────────────────────────────────────────────────
  function handleSelect(profile) {
    if (profile.isGuest) { onSelectProfile(GUEST_PROFILE); return; }
    if (profile.pin) {
      setPinTarget(profile);
      setPinInput("");
      setPinError(false);
      setMode("pin");
    } else {
      onSelectProfile(profile);
    }
  }

  // ── Create ────────────────────────────────────────────────────────────────
  function handleCreate({ name, avatar, pin, isKids }) {
    const profile = createProfile({
      name, avatar,
      pin: pin || null,
      isKids,
      isAdmin: profiles.length === 0,
    });
    saveProfiles([...getProfiles(), profile]);
    if (isKids) {
      const pStore = profileStorage(profile.id);
      if (pStore.get("ageLimit") === null) pStore.set("ageLimit", "7");
    }
    reload();
    setMode("select");
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function handleEdit({ name, avatar, pin, isKids }) {
    const updates = { name, avatar, isKids };
    if (pin) updates.pin = pin;
    updateProfile(editTarget.id, updates);
    if (isKids && !editTarget.isKids) {
      const pStore = profileStorage(editTarget.id);
      if (pStore.get("ageLimit") === null) pStore.set("ageLimit", "7");
    }
    reload();
    setMode("manage");
    setEditTarget(null);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete(id) {
    deleteProfile(id);
    reload();
  }

  // ── PIN screen ────────────────────────────────────────────────────────────
  if (mode === "pin") {
    return (
      <div className="profile-page" ref={containerRef}>
        <div className="profile-pin-screen">
          <div className="profile-avatar-lg">{pinTarget.avatar}</div>
          <div className="profile-name-lg">{pinTarget.name}</div>
          <div className="pin-label">Enter PIN</div>
          <PinPad
            value={pinInput}
            onChange={setPinInput}
            onSubmit={(pin) => {
              if (verifyPin(pinTarget, pin)) onSelectProfile(pinTarget);
              else { setPinError(true); setPinInput(""); }
            }}
            error={pinError}
          />
          <button className="tv-btn tv-btn-ghost tv-focusable mt-lg" tabIndex={0} onClick={() => setMode("select")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Create screen ─────────────────────────────────────────────────────────
  if (mode === "create") {
    return (
      <div className="profile-page" ref={containerRef}>
        <ProfileForm
          title="Create Profile"
          isFirstProfile={profiles.length === 0}
          onSave={handleCreate}
          onCancel={() => setMode("select")}
        />
      </div>
    );
  }

  // ── Edit screen ───────────────────────────────────────────────────────────
  if (mode === "edit" && editTarget) {
    return (
      <div className="profile-page" ref={containerRef}>
        <ProfileForm
          title="Edit Profile"
          initial={editTarget}
          onSave={handleEdit}
          onCancel={() => { setMode("manage"); setEditTarget(null); }}
        />
      </div>
    );
  }

  // ── Manage screen ─────────────────────────────────────────────────────────
  if (mode === "manage") {
    return (
      <div className="profile-page" ref={containerRef}>
        <div className="profile-header">
          <RushFlixLogo size="lg" />
          <div className="profile-subtitle">Manage Profiles</div>
        </div>
        <div className="manage-list">
          {profiles.map((p) => (
            <div key={p.id} className="manage-row">
              <div className="manage-row-left">
                <span className="manage-avatar">{p.avatar}</span>
                <div className="manage-info">
                  <span className="manage-name">{p.name}</span>
                  <div className="manage-badges">
                    {p.isAdmin && <span className="profile-badge manage-badge-admin">ADMIN</span>}
                    {p.isKids  && <span className="profile-badge">KIDS</span>}
                    {p.pin     && <span style={{ fontSize: 14 }}>🔒</span>}
                  </div>
                </div>
              </div>
              <div className="manage-row-actions">
                <button
                  className="tv-btn tv-btn-ghost tv-focusable"
                  tabIndex={0}
                  onClick={() => { setEditTarget(p); setMode("edit"); }}
                >
                  Edit
                </button>
                <button
                  className="tv-btn tv-btn-ghost tv-focusable"
                  tabIndex={0}
                  onClick={() => handleDelete(p.id)}
                  disabled={p.isAdmin && profiles.length === 1}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button className="tv-btn tv-btn-ghost tv-focusable mt-lg" tabIndex={0} onClick={() => setMode("select")}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Select screen (default) ───────────────────────────────────────────────
  return (
    <div className="profile-page" ref={containerRef}>
      <div className="profile-header">
        <div className="rushflix-wordmark">RUSH FLIX</div>
        <div className="profile-subtitle">Who&apos;s watching?</div>
      </div>
      <div className="profile-grid">
        {profiles.map((p) => (
          <button key={p.id} className="profile-card tv-focusable" tabIndex={0} onClick={() => handleSelect(p)}>
            <div className="profile-avatar">{p.avatar}</div>
            <div className="profile-label">{p.name}</div>
            {p.isKids  && <div className="profile-badge">KIDS</div>}
            {p.isAdmin && <div className="profile-badge manage-badge-admin">ADMIN</div>}
            {p.pin     && <div className="profile-lock">🔒</div>}
          </button>
        ))}

        {/* Guest profile */}
        <button className="profile-card profile-guest tv-focusable" tabIndex={0} onClick={() => handleSelect(GUEST_PROFILE)}>
          <div className="profile-avatar">👤</div>
          <div className="profile-label">Guest</div>
          <div className="profile-badge profile-badge-guest">TEMP</div>
        </button>

        {/* Add new profile (max 6) */}
        {profiles.length < 6 && (
          <button className="profile-card profile-add tv-focusable" tabIndex={0} onClick={() => setMode("create")}>
            <div className="profile-avatar">＋</div>
            <div className="profile-label">Add Profile</div>
          </button>
        )}
      </div>

      {profiles.length > 0 && (
        <button className="tv-btn tv-btn-ghost tv-focusable mt-lg" tabIndex={0} onClick={() => setMode("manage")}>
          Manage Profiles
        </button>
      )}
    </div>
  );
}
