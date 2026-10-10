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
npm ci                        # exact versions from package-lock.json
npm run build                 # web bundle → dist/
npx cap sync android          # copy dist/ + generate android/capacitor-cordova-android-plugins/
cd android
./gradlew clean assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

- **Use `cap sync`, not `cap copy`.** A fresh clone has no `android/capacitor-cordova-android-plugins/` (generated, not committed) and Gradle fails without it; only `sync` creates it. Rush Flix uses **no Capacitor plugins** on purpose — `sync` must leave `android/capacitor.settings.gradle` and `android/app/capacitor.build.gradle` unchanged. If `git status` shows them modified after a sync, a plugin crept into `package.json`.
- Back button / exit are native (`MainActivity` → `rushflix:backButton` event, `RushFlixBridge.exitApp()`); don't add `@capacitor/app` — its back listener would double-handle Back.
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
3. Refresh the ad blocklist: `npm run update:blocklist` (HaGeZi Pro + `scripts/adblock-custom.txt` → `android/app/src/main/assets/adblock/domains.txt`; commit it).
4. Build the APK (clean) and IPK as above. If Gradle fails, **don't** reuse whatever APK is left in `build/outputs`. It's the previous version.
5. Verify the APK: signature SHA-256 starts `63cfea24`; `aapt2 dump badging` shows the new `versionCode`.
6. Commit, tag `vX.Y.Z`, push, and create the GitHub release with **both** assets named exactly:
   - `Rush-Flix_VX.Y.Z.apk`
   - `Rush-Flix_VX.Y.Z.ipk`

   The in-app updater finds them by these names.
7. **Run the release check:**
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
- **Ad blocking (v2.7.5)** — the Cineby player loads ad scripts *inside* its frames (e.g. the "Confirm you're not a robot" QR scam overlay). Two layers:
  1. **Network** (`AdBlocker.java`, `shouldInterceptRequest`): every request from every frame is checked against `assets/adblock/domains.txt` (HaGeZi Pro + `scripts/adblock-custom.txt`, ~200k domains, kept as sorted 64-bit hashes); matches get an empty 204. Blocks trackers and known ad networks.
  2. **Script** (`PLAYER_SCRIPT`): refuses `<script src>` from third-party hosts on throwaway TLDs (`.cfd`, `.cyou`, `.rest`, `.space`…) — the ad loaders use random names there, faster than any list.
  - ⚠️ **Never block those TLDs at the network level**: the video streams come from throwaway domains too (e.g. `*.space` / `*.site` serving `/generate.php` + HLS) as fetch/XHR. Doing so broke playback in testing.
  - New ad domain seen? Check what it delivers first, then add it to `scripts/adblock-custom.txt` and run `npm run update:blocklist`.
  - Browser / LG webOS use a plain iframe and get none of this.
- **Autoplay waits for `loadedmetadata`** (v2.7.8). Playing the moment the `<video>` appears beat the player's own `play` listener, so it thought it was paused: on phones the pause button never appeared (touch layout shows centre controls only under `.jw.show-ui.playing`).
- **`wake()`** = synthetic `pointermove` on `#player` after every remote command. The Cineby player's 2.8 s auto-hide only restarts from pointer events, so without it the bar stuck on screen after pause → play.
- **Remote map** (`dispatchKeyEvent`, overlay up):

  | Key | Normal | Controls mode |
  |---|---|---|
  | OK / Enter | play/pause (native centre tap until a video exists) | press the highlighted button / menu row |
  | Play/Pause · Play · Pause | toggle · play · pause | same |
  | Left / Right | ±10 s (shows the bar) | move along the bar / menu |
  | Up / Down | enter controls mode (bar + highlight on Play) | move within an open menu |
  | Rewind / Fast-forward | ±30 s | same |
  | Back | close the player | close the open menu, else leave controls mode |

  Controls mode lives in `PLAYER_SCRIPT` (`ctl_enter/ctl_move/ctl_ok/ctl_back`, `.rf-focus` outline); the player frame reports it via `RushFlixProgress.controlsMode(bool)`. Navigable: visible `#controls button.jw-btn` + centre/Up Next buttons (Airplay/Cast/Fullscreen skipped), or the open `.jw-menu`'s rows. It ends by itself when the player hides its bar. Some titles' quality lists map rows oddly (720p → 1080p) — that's the player, a mouse click does the same.

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
│   ├── AdBlocker.java            # Network-level ad/tracker blocking for the overlay player
│   ├── ApkUpdaterPlugin.java     # In-app APK download + install
│   └── TokenRelayServer.java     # Local server (port 8080) for phone QR setup
├── scripts/
│   ├── check-updater.mjs         # Release check (npm run check:updater)
│   ├── update-blocklist.mjs      # Refresh assets/adblock/domains.txt (npm run update:blocklist)
│   ├── adblock-custom.txt        # Our own extra ad domains (merged into the blocklist)
│   ├── package-webos.js          # webOS IPK builder
│   └── gen-tv-banner.js          # Android TV launcher banner
├── docs/
│   ├── feedback.html             # Feedback web form (GitHub Pages)
│   └── DEVELOPMENT.md            # This file
└── appinfo.json                  # webOS manifest
```
