# Rush Flix

[![Stars](https://img.shields.io/github/stars/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](https://github.com/Rushikesh-Nivalkar/Rush-Flix/stargazers)
[![Issues](https://img.shields.io/github/issues/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](https://github.com/Rushikesh-Nivalkar/Rush-Flix/issues)
[![License](https://img.shields.io/github/license/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](LICENSE)

**Private Netflix-style streaming app built for Android TV, Google TV, Chromecast with Google TV, and Android phones.**

Rush Flix is a self-hosted streaming app that aggregates metadata from TMDB and plays through third-party embed players. It ships as a single Capacitor Android APK — the same APK sideloads onto Android TV, Google TV, Chromecast with Google TV, and Android phones.

> **For personal/educational use only.** Rush Flix does not host, store, or distribute any video content. All playback is handled by third-party embed players outside the control of this project.

---

## What Rush Flix Can Do ✅

### Browsing & Discovery
- Browse trending movies and TV shows powered by [TMDB](https://www.themoviedb.org/)
- Search any title by name across movies and TV series
- View full metadata: synopsis, genres, cast, runtime, release year, age rating
- Similar/related titles row on every detail page
- Trailer playback via YouTube embed
- Separate anime metadata via [AniList](https://anilist.co/) — richer descriptions, season mapping, studio info

### Playback
- Stream movies and TV episodes through embedded players (no account required on those services)
- Three switchable player sources: **Videasy**, **VidSrc**, **2Embed** — pick on detail page before playback, or switch mid-session
- D-pad navigation fully supported on Android TV remotes (up/down/left/right/select/back)
- Skip forward/back **±10 seconds** using left/right D-pad while a video is playing
- Autoplay on episode/movie open — no manual play button tap required on Android TV
- Up Next auto-advance after an episode ends *(video/direct mode only)*
- Episode list overlay accessible with D-pad down while watching
- Intro skip — AniSkip for anime (exact timestamps); configurable fixed duration (10–600s, default 90s) for all other content; modes: off / auto-skip / manual prompt

### Progress & Library
- **Continue Watching** — resumes from exact timestamp; 5% threshold prevents ghost entries; Up Next badge queues next episode automatically
- Per-episode and per-movie progress bars visible in Library and episode lists
- Watch History (last 50 titles, per profile) — displayed as horizontal carousel
- **Watchlist** — save titles to watch later, displayed as horizontal carousel
- Mark as Watched / Unwatch individual episodes or full seasons
- Progress, history, and watchlist are all **per profile** — isolated between users

### Profiles
- Multiple named profiles with emoji avatars
- Guest mode (session-only, data cleared on exit)
- All watch data fully isolated per profile

### Anime
- Auto-detects anime content (TMDB genre 16 + Japanese origin country)
- Fetches AniList metadata: studio, season year, episode count, clean descriptions
- AniList season mapping — sequels listed as numbered seasons
- **AniSkip** intro/outro detection with auto-skip or prompt mode

### Subtitles *(video/direct mode only)*
- Auto-fetches subtitles on playback start
- Language picker with multiple language options
- Subtitle size and vertical position settings (top/bottom)
- Toggle on/off mid-playback

### TV Experience
- Custom row-based D-pad navigation (tvNav.js) — replaced BBC lrud-spatial
- TV-optimised full-screen layout — no mouse or touchscreen required
- Android TV launcher banner with Rush Flix branding
- Back button returns to previous screen without exiting the app
- Media keys supported: Play/Pause, Fast Forward, Rewind
- Focus management — cursor lands in the right place on every page transition
- Source picker on the detail page — choose Videasy/VidSrc/2Embed before playback starts
- Settings: 5-tab sidebar (Playback / Subtitles / Interface / Library / Data), fully D-pad navigable
- QR key pairing — scan from phone to set TMDB, Wyzie, or SubDL API keys on TV
- Genre rows: dynamic TMDB genre dropdown, Left/Right D-pad to cycle genres

### Phone Experience
- Same APK as Android TV — download once, install on TV or phone
- App launches in landscape orientation (locked) — portrait mode disabled; the UI is designed for landscape video browsing
- Status bar hidden automatically for full-screen immersive viewing
- Touch to browse and scroll — tap cards, buttons, and menus as in any Android app
- Android back button pops the navigation stack (goes back one screen at a time); pressing back on the Home screen exits the app cleanly

### Settings & Customisation
- 5-tab sidebar: Playback / Subtitles / Interface / Library / Data — all panels D-pad navigable
- TMDB API key management (your own key, free from TMDB)
- QR key pairing — scan from phone to pair TMDB, Wyzie, or SubDL API keys on TV
- Accent colour themes
- Font size: normal / large
- Compact mode for episode lists
- Reduce animations toggle
- Subtitle language, size, and position defaults
- Intro skip mode: off / prompt / auto; configurable fixed duration (10–600 seconds) for non-anime content
- Age/parental content limit (hides titles above a rating threshold)
- Watch history toggle (disable tracking entirely)
- Start page selection (Home, Library, etc.)
- Rating country selection
- Home page row ordering and visibility — toggle and reorder rows
- In-app update checker — checks GitHub Releases on startup (6-hour cooldown) and on demand from Settings; shows a banner on the Home page when a newer version is available; one-tap APK download and install without leaving the app

### Data & Sync
- All data stored locally in `localStorage` — no account, no cloud required
- **LAN sync** — sync watch progress, watchlist, and watched state across devices on the same network
- Per-profile data isolation
- JSON catalogue support — import custom content lists by URL
- Shared library / personal media / friends media source rows on the Home screen

### Custom Sources
- Add custom stream URLs manually — direct MP4/HLS links play in the native HTML5 video player
- Shared library, personal media, and friends media content rows
- Archive.org public domain content integration

---

## What Rush Flix Cannot Do ❌

### Content Limitations
- **Cannot download content** — no offline viewing, no download queue
- **Playback not guaranteed for streaming exclusives** — Rush Flix shows listings for all TMDB titles (including Netflix Originals, Amazon Exclusives, Disney+ titles), but the embed players (Videasy, VidSrc, 2Embed) may not have working streams for content that platforms exclusively distribute under DRM; try all three sources before concluding a title is unavailable
- **Cannot guarantee a working source** — embed players go down, get blocked, or change URLs; if all three sources fail for a title there is no further fallback beyond manually switching
- **Cannot bypass regional restrictions** — if an embed player geo-blocks content in your country, Rush Flix cannot work around it; a VPN at the OS or router level is needed
- **Cannot control video quality** — resolution, bitrate, and codec are entirely up to the third-party embed player; Rush Flix cannot force 4K or HDR

### Iframe Embed Player Limitations
When using Videasy, VidSrc, or 2Embed, playback runs inside a cross-origin iframe. Browser security restrictions prevent Rush Flix from fully controlling the player:

- **No subtitles** — subtitle fetching only works in direct video (MP4/HLS) mode
- **No AniSkip intro detection** — only works in direct video mode
- **No Up Next auto-advance** — the app cannot detect when the video ends inside the iframe; use the manual Next Episode button instead
- **Autoplay is best-effort** — Rush Flix injects a script to trigger autoplay, but some embed players have their own interaction gates that may require one manual click on first load
- **Progress tracking requires script injection** — if an embed player blocks the injected script via strict CSP headers, progress will not be saved for that session

### App Limitations
- **No cloud sync or accounts** — all data is on-device; uninstalling the app deletes everything
- **No Chromecast/AirPlay casting** — cannot cast from the app to a second screen
- **No push notifications** — new episode alerts require the app to be open and running
- **No multi-user real-time sync** — profiles are local-only
- **No parental lock PIN** — the age limit setting hides content but has no password protection
- **No watch party or viewing sync with others**
- **No built-in VPN or proxy**

---

## Streaming Sources

Rush Flix routes playback through three public embed players using TMDB IDs:

| Source | Movies | TV Episodes | Notes |
|---|---|---|---|
| [Videasy](https://player.videasy.net) | ✅ | ✅ | Default — generally most reliable |
| [VidSrc](https://vidsrc.to) | ✅ | ✅ | Good fallback |
| [2Embed](https://www.2embed.online) | ✅ | ✅ | Occasionally unstable |

Switch sources from the picker bar above the player. If one source fails for a specific title, try the next.

---

## What's New — v2.0.0

### Android Phone Support
- The same APK now installs and runs on Android phones — no separate phone build required
- App locks to landscape orientation automatically on phones; portrait mode is disabled (the UI is designed for landscape)
- Status bar hidden for full-screen immersive viewing on phones
- Android back button pops the navigation stack; pressing back on the Home screen exits the app cleanly

### In-App Update Checker
- Checks GitHub Releases automatically on startup — once per 6 hours, fully background (zero impact on video playback)
- Manual check available from Settings
- When an update is available: banner appears on the Home page with release notes and a one-tap install button
- APK downloads and installs directly within the app — no browser or app store required

### Build
- v2.0.0 (versionCode 3)
- Minimum Android version: 7.0 (API 24)

---

## What's New — v1.1.1

### TV Navigation Overhaul
- Custom row-based D-pad navigation (`tvNav.js`) replaces BBC lrud-spatial
- Two-zone settings model — sidebar (↕ cycles tabs) + panel (↕ moves between fields); ← exits to sidebar
- Genre rows: Left/Right D-pad cycles TMDB genres without intercepting vertical nav

### Source Picker on Detail Page
- Videasy / VidSrc / 2Embed pills on Movie and TV detail pages — pick before playback, no mid-session switching needed

### Intro Skip
- Anime: AniSkip API exact timestamps; all other content: configurable fixed duration (10–600s, default 90s)
- Modes: off / auto-skip / manual prompt

### Home Page
- Recently Added row: TMDB now_playing + on_the_air interleaved 1:1
- You Would Love This row: recommendations from last 3 watched, filtered against history
- Genre rows: dynamic TMDB dropdown (Movies + Series), top-rated sort, vote_count ≥ 100
- Cross-row deduplication — same title never appears in two rows simultaneously

### Library Page
- Continue Watching, Watchlist, and Watch History all converted to horizontal carousels
- Continue Watching threshold 2% → 5% (eliminates ghost entries from stalled iframes)
- SERIES_NEXT map queues next episode on completion; Up Next badge in row

### QR Key Setup
- Pair TMDB, Wyzie, or SubDL API keys by scanning a QR code from your phone — no TV keyboard required

### Settings
- 5-tab sidebar: Playback / Subtitles / Interface / Library / Data — fully D-pad navigable

### Build
- Signed release APK via `gradlew.bat assembleRelease` — Android Studio no longer required
- v1.1.1 (versionCode 2)

---

## Requirements

- A free [TMDB API Read Access Token](https://www.themoviedb.org/settings/api) — needed for metadata and search
- An Android TV, Google TV, or Chromecast with Google TV device, or an Android phone running Android 7.0 or later *(for the APK)*
- Node.js ≥ 18

---

## Installation

### Sideloading the APK onto a TV (Recommended)

1. Download **`Rush-Flix_V2.0.0.apk`** from the [Releases page](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases)
2. Enable **Unknown Sources** / **Install Unknown Apps** on your TV device
3. Transfer the APK to your TV via USB drive, local network share, or a file manager app — then open and install it
4. Launch **Rush Flix** from the TV apps list
5. On first launch, enter your TMDB Read Access Token when prompted

### Sideloading the APK onto an Android Phone

1. Download **`Rush-Flix_V2.0.0.apk`** from the [Releases page](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases)
2. On your phone, go to **Settings → Security** (or **Settings → Apps → Special app access**) and enable **Install unknown apps** for your browser or file manager
3. Open the downloaded APK on your phone and tap **Install**
4. Launch **Rush Flix** from your app drawer
5. On first launch, enter your TMDB Read Access Token when prompted — or tap Skip to add it later in Settings

> The app opens in landscape orientation automatically. This is by design — the browsing UI is landscape-optimised. Portrait mode is disabled.

### Running as a Web App on Local Network

```bash
git clone https://github.com/Rushikesh-Nivalkar/Rush-Flix.git
cd Rush-Flix
npm install
npm run dev
```

Open `http://localhost:5173` in any browser. Replace `localhost` with your machine's local IP to access from a TV or other device on the same network.

### Building the Android APK from Source

```bash
# 1. Install dependencies
npm install

# 2. Build the web bundle
npm run build

# 3. Sync to Android project
npx cap copy android

# 4. Open in Android Studio
npx cap open android
```

Or build a signed release APK from the command line:

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

> Requires `android/keystore.properties` (not committed — contains signing credentials).

---

## First-Time Setup

1. Launch the app on your TV or browser
2. Enter your **TMDB Read Access Token** (free at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api))
3. Create a profile — pick a name and an emoji avatar
4. Start watching — trending content loads immediately

> To skip the API key step, tap **Skip**. The app will still work with manually added custom stream URLs, but TMDB metadata and search will not function.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + Vite |
| TV navigation | Custom row-based D-pad navigation (tvNav.js) |
| Animations | [Motion](https://motion.dev/) |
| Android wrapper | [Capacitor 8](https://capacitorjs.com/) |
| Movie/TV metadata | [TMDB API](https://developer.themoviedb.org/) |
| Anime metadata | [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/) |
| Intro detection | [AniSkip API](https://aniskip.com/) |
| Storage | localStorage (browser-native, no database required) |

---

## Project Structure

<details>
<summary>Click to expand</summary>

```
Rush-Flix/
├── src/
│   ├── components/
│   │   ├── TVPlayer.jsx          # Main player — video mode + iframe embed mode
│   │   ├── TVNavBar.jsx          # Top navigation bar — non-interactive logo + nav tabs
│   │   ├── MediaCard.jsx         # Movie/show card with progress bar + D-pad focus
│   │   ├── RushFlixLogo.jsx      # Animated RF logo (icon mark + wordmark)
│   │   ├── SearchModal.jsx       # Full-screen search overlay with D-pad trap
│   │   ├── TrailerModal.jsx      # YouTube trailer overlay
│   │   └── ApiKeyQRModal.jsx     # QR code pairing for TMDB / Wyzie / SubDL API keys
│   ├── pages/
│   │   ├── HomePage.jsx          # Flat horizontal card rows — Continue Watching, Trending, etc.
│   │   ├── MoviePage.jsx         # Movie detail page + player
│   │   ├── TVPage.jsx            # TV show detail + episode list + player
│   │   ├── LibraryPage.jsx       # Continue Watching, Watchlist, History
│   │   ├── SettingsPage.jsx      # All app settings
│   │   ├── SourcesPage.jsx       # Custom media sources management
│   │   ├── ProfileSelectPage.jsx # Profile picker and creation
│   │   └── PhoneSetupPage.jsx    # QR-code phone setup screen
│   ├── utils/
│   │   ├── api.js                # TMDB fetch, player sources, AniList
│   │   ├── tvNav.js              # Custom row-based D-pad navigation (ROW_THRESHOLD=30px)
│   │   ├── storage.js            # localStorage helpers + STORAGE_KEYS
│   │   ├── profiles.js           # Profile management
│   │   ├── aniSkip.js            # AniSkip intro/outro timings
│   │   ├── subtitleFetch.js      # Subtitle URL fetching
│   │   ├── lanSync.js            # LAN sync push/pull
│   │   ├── homeLayout.js         # Home row config — genreMovies/genreSeries dynamic rows
│   │   └── appearance.js         # Accent colour + theme helpers
│   ├── styles/
│   │   ├── global.css            # Base styles — layout, cards, search modal, typography
│   │   └── tv.css                # TV-specific overrides — card sizes, focus rings, D-pad nav
│   └── App.jsx                   # Root component — routing, profiles, state
├── android/
│   └── app/src/main/java/com/rushflix/app/
│       ├── MainActivity.java     # D-pad injection + iframe script injection
│       └── TokenRelayServer.java # Local token relay for LAN sync
├── public/
│   └── logo.svg                  # App favicon (vector)
└── scripts/
    └── gen-tv-banner.js          # Generates Android TV launcher banner PNG
```

</details>

---

## Legal Disclaimer

Rush Flix is a personal project intended for **educational and private use only**.

- Rush Flix does **not** host, store, cache, or distribute any video content
- All video streams are sourced from **third-party embed players** that Rush Flix has no affiliation with
- Responsibility for the legality of streamed content rests entirely with those third-party services and the end user
- Streaming copyrighted content without authorisation may be illegal in your jurisdiction
- This project is **not affiliated** with Netflix, TMDB, or any streaming service

The author provides this code for educational purposes. **Use at your own risk.**

---

## Acknowledgements

- [TMDB](https://www.themoviedb.org/) — movie and TV metadata
- [AniList](https://anilist.co/) — anime metadata and season graphs
- [AniSkip](https://aniskip.com/) — anime intro/outro timing data
- [StreamBert](https://github.com/truelockmc/streambert) — original inspiration and architecture reference
