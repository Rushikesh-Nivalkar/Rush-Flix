const PROFILES_KEY = "rushflix_profiles";
const ACTIVE_PROFILE_KEY = "rushflix_activeProfile";

export const AVATARS = [
  "🎬", "🎭", "🎥", "🍿", "🦁", "🐯", "🐧", "🦊",
  "🐸", "🤖", "👾", "🦄", "🌙", "⭐", "🔥", "💎",
];

export function getProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function createProfile({ name, avatar = "🎬", pin = null, isKids = false, isAdmin = false }) {
  const id = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return { id, name, avatar, pin, isKids, isAdmin, createdAt: Date.now() };
}

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
}

export function setActiveProfileId(id) {
  if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  else localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

export function getActiveProfile() {
  const id = getActiveProfileId();
  if (!id) return null;
  return getProfiles().find((p) => p.id === id) || null;
}

export function updateProfile(id, updates) {
  const profiles = getProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return;
  profiles[idx] = { ...profiles[idx], ...updates };
  saveProfiles(profiles);
}

export function deleteProfile(id) {
  const profiles = getProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  // Clear all per-profile data
  const prefix = `rushflix_${id}_`;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => localStorage.removeItem(k));
  if (getActiveProfileId() === id) setActiveProfileId(null);
}

export function verifyPin(profile, pin) {
  if (!profile.pin) return true;
  return profile.pin === pin;
}
