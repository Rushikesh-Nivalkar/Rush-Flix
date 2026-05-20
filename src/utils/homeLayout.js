// ── Home Page Layout Utilities ────────────────────────────────────────────────
// Shared between SettingsPage (editing) and HomePage (reading).

import { storage } from "./storage";

export const HOME_ROWS = [
  { id: "continue",      label: "Continue Watching" },
  { id: "watchlist",     label: "My Watchlist" },
  { id: "recentlyAdded", label: "Recently Added" },
  { id: "sharedLibrary", label: "Shared Library" },
  { id: "personalMedia", label: "Personal Media" },
  { id: "publicDomain",  label: "Free to Watch" },
  { id: "friendsMedia",  label: "Friends' Picks" },
  { id: "similar",       label: "Similar to…" },
  { id: "trendingMovies",label: "Trending Movies" },
  { id: "trendingTV",    label: "Trending Series" },
  { id: "topRated",      label: "Top Rated" },
  { id: "genreAction",      label: "Action" },
  { id: "genreDrama",       label: "Drama" },
  { id: "genreComedy",      label: "Comedy" },
  { id: "jsonCatalogue",    label: "My Catalogue" },
];

const DEFAULT_ROW_ORDER = HOME_ROWS.map((r) => r.id);
const DEFAULT_ROW_VISIBLE = Object.fromEntries(
  HOME_ROWS.map((r) => [r.id, r.id !== "publicDomain"]),
);

export function loadHomeLayout() {
  const savedOrder = storage.get("homeRowOrder");
  const savedVisible = storage.get("homeRowVisible");
  const knownIds = new Set(HOME_ROWS.map((r) => r.id));

  const order = savedOrder
    ? [
        ...savedOrder.filter((id) => knownIds.has(id)),
        ...DEFAULT_ROW_ORDER.filter((id) => !savedOrder.includes(id)),
      ]
    : DEFAULT_ROW_ORDER;

  const visible = savedVisible
    ? { ...DEFAULT_ROW_VISIBLE, ...savedVisible }
    : DEFAULT_ROW_VISIBLE;

  return { order, visible };
}

export function loadHomeViewMode() {
  return storage.get("homeViewMode") || "carousel";
}

export function saveHomeViewMode(mode) {
  storage.set("homeViewMode", mode);
}
