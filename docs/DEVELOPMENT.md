# Rush Flix: Development Guide

Everything for building, running and releasing Rush Flix. For installing and using the app, see the [README](../README.md).

---

## Requirements

| For | You need |
|---|---|
| Web app / dev server | Node.js ≥ 18 |
| Android APK | JDK **21** (Gradle 8.14 does not run on JDK 25), Android SDK Platform **36** + Build-Tools 36 |
| webOS IPK | Node.js only (pure-Node packager) |
| Installing on an LG TV | `npm install -g @webos-tools/cli` + a TV in Developer Mode (see README) |

---

## Run as a web app

```bash
git clone https://github.com/Rushikesh-Nivalkar/Rush-Flix.git
cd Rush-Flix
npm install
npm run dev          # http://localhost:5173
npm run serve        # build preview on your LAN (enables phone QR setup in the browser)
```

In the browser the embed player runs in an `<iframe>`; in the Android app it runs in a native overlay WebView (see [Architecture notes](#architecture-notes)).

---

## Build the Android APK

```bash
npm install
npm run build                 # web bundle → dist/
npx cap copy android          # copy dist/ into the Android project
cd android
./gradlew clean assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

- **Always `clean`.** An incremental build once shipped stale web assets (wrong version shown in Settings).
- `android/local.properties` must point at your SDK: `sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk`
- Release signing needs `android/keystore.properties` (**never committed**):
  ```properties
  storeFile=../rush-flix-release.jks
  storePassword=…
  keyAlias=rush-flix
  keyPassword=…
  ```
- **Releases must be signed with the original `rush-flix-release.jks`.** Android refuses an update signed with a different key, so the in-app updater would fail and users would have to uninstall (losing their data). Check before publishing:
  ```bash
  apksigner verify --print-certs app-release.apk   # SHA-256 must start 63cfea24
  ```

To open the project in Android Studio instead: `npx cap open android`.

## Build the webOS IPK

```bash
npm run build:webos           # vite build + package → Rush-Flix_V<version>.ipk
npm run deploy:webos          # optional: ares-install + launch on the paired TV "lgtv"
```

---

## Release process

1. **Start from GitHub `main`.** Make sure your working copy matches it before changing anything.
2. Bump the version in **all four** places:
   - `package.json` → `version`
   - `appinfo.json` → `version` (webOS)
   - `android/app/build.gradle` → `versionCode` (+1) and `versionName`
   - `src/utils/updateChecker.js` → fallback `APP_VERSION`
3. Build the APK (clean) and IPK as above. If Gradle fails, **don't** reuse whatever APK is left in `build/outputs`. It's the previous version.
4. Verify the APK: signature SHA-256 starts `63cfea24`; `aapt2 dump badging` shows the new `versionCode`.
5. Commit, tag `vX.Y.Z`, push, and create the GitHub release with **both** assets named exactly:
   - `Rush-Flix_VX.Y.Z.apk`
   - `Rush-Flix_VX.Y.Z.ipk`

   The in-app updater finds them by these names.
6. **Run the release check:**
   ```bash
   npm run check:updater            # expects v<package.json version>
   npm run check:updater -- v2.7.3  # or a specific tag
   ```
   It runs the real update-check code in headless Chrome from a different origin (exactly like the app WebView) and fails unless it finds the release with both assets. **Never ship a change to the update checker without it passing.**

---

## Architecture notes

### Player
- One embed source: **Cineby** (`api.cineby.homes/embed/{movie|tv}/…`). URLs come from `getSourceUrl()` in `src/utils/api.js`.
- The Android app follows domain moves automatically (`checkSourceRedirect` → saved override).
- VidSrc (`vsembed.ru`) was removed in v2.7.3: it serves a byte-identical page with the same player host. Cineby ignores `?lang=`, so there's no language option.

### Android overlay player (`MainActivity.java`)
- Embed URLs load as the **top-level page** of a second, native WebView (`RushFlixBridge.openPlayer`), not an iframe, so autoplay works.
- `PLAYER_SCRIPT` is injected into **every frame** (`WebViewCompat.addDocumentStartJavaScript`). It finds the `<video>`, autoplays, reports progress, and handles remote commands via `window.__rfCmd`.
- **Commands carry an id and are applied once per frame.** The embed pages forward parent messages to their player frame too; without the id every command arrived twice (pause → instant resume).
- Ad protection: popups refused (`onCreateWindow`), top-level navigation away from the player host blocked, `window.open` disabled in all frames.
- Remote OK: native touch at the screen centre until a video exists, then play/pause.

### Update checker (`src/utils/updateChecker.js`)
- Android: native HTTP (`CapacitorHttp.request`). Browser/webOS: `fetch` to **`api.github.com/repos/…/releases/latest`**.
- ⚠️ **Never use `github.com/…/releases.atom`.** It sends no CORS header, so the WebView blocks it. v2.5.0–v2.7.0 shipped with it and the update button never worked.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 18 + Vite 7 |
| TV navigation | Custom row-based D-pad navigation (`tvNav.js`) |
| Animations | [Motion](https://motion.dev/) |
| Android wrapper | [Capacitor 8](https://capacitorjs.com/) (+ `androidx.webkit` for the overlay player) |
| webOS packaging | Pure Node.js IPK builder (`scripts/package-webos.js`) |
| Metadata | [TMDB API](https://developer.themoviedb.org/), [AniList GraphQL](https://anilist.gitbook.io/anilist-apiv2-docs/) |
| Intro detection | [AniSkip API](https://aniskip.com/) |
| Live TV | [iptv-org](https://github.com/iptv-org/iptv) M3U playlists + JSON API |
| Storage | `localStorage` (per profile, no backend) |

---

## Project structure

```
Rush-Flix/
├── src/
│   ├── components/
│   │   ├── TVPlayer.jsx          # Movie/TV player: direct video mode + iframe / native overlay bridge
│   │   ├── LivePlayer.jsx        # Live TV player: HLS + prev/next channel + geo-block hint
│   │   ├── TVNavBar.jsx          # Top navigation (incl. Live TV country/category/language tabs)
│   │   ├── MediaCard.jsx         # Poster card with progress bar + D-pad focus
│   │   ├── SetupScreen.jsx       # First-run TMDB setup (QR pairing / manual entry)
│   │   ├── ApiKeyQRModal.jsx     # QR pairing for Wyzie / SubDL keys
│   │   ├── UpdateDialog.jsx      # Update banner/dialog: APK download+install, IPK link on webOS
│   │   ├── FeedbackSection.jsx   # Settings → Feedback (GitHub Issues)
│   │   ├── SearchModal.jsx       # Full-screen search
│   │   └── TrailerModal.jsx      # YouTube trailer overlay
│   ├── pages/
│   │   ├── HomePage.jsx          # Card rows: Continue Watching, Trending, genres…
│   │   ├── MoviePage.jsx         # Movie detail + player
│   │   ├── TVPage.jsx            # Show detail + episodes + player
│   │   ├── LiveTVPage.jsx        # Live TV grid: search + filters
│   │   ├── LibraryPage.jsx       # Continue Watching, Watchlist, History
│   │   ├── SettingsPage.jsx      # Settings (7 tabs)
│   │   ├── SourcesPage.jsx       # Custom sources
│   │   ├── ProfileSelectPage.jsx # Profiles
│   │   └── PhoneSetupPage.jsx    # Page the phone opens after scanning the QR code
│   ├── utils/
│   │   ├── api.js                # TMDB, Cineby URL + redirect tracking, AniList
│   │   ├── updateChecker.js      # Update check (see notes above)
│   │   ├── m3uParser.js          # Live TV playlists + iptv-org metadata
│   │   ├── tvNav.js              # D-pad navigation
│   │   ├── storage.js            # localStorage helpers + STORAGE_KEYS
│   │   ├── platform.js           # isWebOS / isCapacitorNative
│   │   └── …                     # profiles, aniSkip, subtitles, lanSync, homeLayout, appearance
│   └── App.jsx                   # Routing, profiles, back-button handling
├── android/app/src/main/java/com/rushflix/app/
│   ├── MainActivity.java         # Overlay player, PLAYER_SCRIPT, remote keys, back button
│   ├── ApkUpdaterPlugin.java     # In-app APK download + install
│   └── TokenRelayServer.java     # Local server (port 8080) for phone QR setup
├── scripts/
│   ├── check-updater.mjs         # Release check (npm run check:updater)
│   ├── package-webos.js          # webOS IPK builder
│   └── gen-tv-banner.js          # Android TV launcher banner
├── docs/
│   ├── feedback.html             # Feedback web form (GitHub Pages)
│   └── DEVELOPMENT.md            # This file
└── appinfo.json                  # webOS manifest
```
