# Rush Flix

[![Latest release](https://img.shields.io/github/v/release/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases/latest)
[![Issues](https://img.shields.io/github/issues/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](https://github.com/Rushikesh-Nivalkar/Rush-Flix/issues)
[![License](https://img.shields.io/github/license/Rushikesh-Nivalkar/Rush-Flix?style=for-the-badge)](LICENSE)

**A Netflix-style app for your TV.** Browse trending movies and shows, keep a watchlist, pick up where you left off, and watch Live TV, all driven by your TV remote.

> **For personal/educational use only.** Rush Flix does not host, store, or distribute any video. All playback comes from a third-party embed player. See the [Legal Disclaimer](#legal-disclaimer).

**Jump to your TV:** [📺 Android TV / Google TV / phones](#-android-tv-google-tv--android-phones) · [📺 LG Smart TVs (webOS)](#-lg-smart-tvs-webos)

---

## Which TV can I install it on?

| Device | Supported | Instructions |
|---|---|---|
| Android TV / Google TV (Sony, TCL, Hisense, Philips and others) | ✅ | [Android →](#-android-tv-google-tv--android-phones) |
| Chromecast with Google TV, Nvidia Shield | ✅ | [Android →](#-android-tv-google-tv--android-phones) |
| Android phones (Android 7.0 or newer) | ✅ | [Android →](#-android-tv-google-tv--android-phones) |
| LG Smart TVs (webOS 3 or newer) | ✅ | [LG →](#-lg-smart-tvs-webos) |
| Amazon Fire TV | ⚠️ Untested (runs Android, so it may work) | [Android →](#-android-tv-google-tv--android-phones) |
| Samsung (Tizen), Roku, Apple TV | ❌ Not supported | |

**Not sure which you have?** On the TV open **Settings → About** (or **Settings → System → About**). If it mentions *Android TV* or *Google TV*, use the Android section. If it's an LG TV with *webOS*, use the LG section.

---

## Before you start: get your free TMDB token

Rush Flix gets its movie and show information from [TMDB](https://www.themoviedb.org/). Each person needs their own free token. Do this on a phone or computer; it takes about 5 minutes.

1. Create a free account at [themoviedb.org/signup](https://www.themoviedb.org/signup) and confirm your email.
2. Open [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) and request an API key. Choose **Developer** / personal use and fill in the short form. Anything sensible works, e.g. *Application name: Rush Flix, Use: personal TV app*.
3. On the same page, copy the **API Read Access Token**. It's the **long** one, starting with `eyJ…`.
   - ⚠️ Don't copy the short **API Key**. Rush Flix will reject it.

Keep the token handy (e.g. in your phone's notes). You'll paste it during setup.

---

## 📺 Android TV, Google TV & Android phones

### 1. Install

**On a TV (Android TV / Google TV / Chromecast / Shield)**

1. On the TV, open the **Play Store**, search for **Downloader** (by AFTVnews), and install it.
2. Allow Downloader to install apps:
   - **Google TV:** Settings → System → … → Install unknown apps → Downloader → **Allow**
   - **Android TV:** Settings → Apps → Security & restrictions → Unknown sources → **Downloader** on
   - Can't find it? Skip this. Android asks during the install; tap **Settings → Allow**.
3. Open **Downloader**, type this address in the URL box and press **Go**:
   ```
   github.com/Rushikesh-Nivalkar/Rush-Flix/releases/latest
   ```
4. Scroll to **Assets** and select **`Rush-Flix_V….apk`**. When it's downloaded, choose **Install**.
5. Open **Rush Flix** from your apps. Downloader offers to delete the APK file afterwards; that's fine.

**On an Android phone**

1. On the phone, open the [latest release](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases/latest) and tap **`Rush-Flix_V….apk`** under **Assets**.
2. Open the downloaded file. If asked, allow your browser to **install unknown apps**, then tap **Install**.
3. Open **Rush Flix**. It always opens in landscape; that's by design.

### 2. Set up

1. On first launch Rush Flix shows **Connect to TMDB** with a **QR code**.
2. Make sure your phone is on the **same Wi-Fi** as the TV, then **scan the QR code** with your phone's camera.
3. A page opens on your phone. **Paste your TMDB token** (see [Before you start](#before-you-start-get-your-free-tmdb-token)) and submit.
4. The TV checks the token and continues on its own. No typing with the remote.
   - Prefer typing? Choose **Enter Manually** on the TV and paste/type the token.
   - "Invalid token"? You probably copied the short API Key. Copy the long `eyJ…` **Read Access Token** instead.
5. **Create a profile:** pick a name and an emoji. Add one per person; watch history and lists are kept separate.
6. You're done. Pick something and press **Watch**.

**Using the remote while watching:** **OK** = play/pause · **Left/Right** = back/forward 10 s · **Rewind/Fast-forward** = 30 s · **Up/Down** = show the player's buttons (subtitles, quality…): move with the arrows, **OK** to choose, **Back** to close · **Back** = leave the player.

### 3. Updating

- Rush Flix checks for updates by itself (a banner appears on the Home screen), or go to **Settings → Playback → Check for updates**.
- Choose update and it downloads and installs **inside the app**. Your profiles, history and watchlist are kept.
- **On version 2.5.0 – 2.7.0?** Those versions' update button doesn't work. Install the latest version once using [step 1](#1-install); it installs over the top and keeps your data. After that, updates work from inside the app.
- ⚠️ **Never uninstall Rush Flix to update.** Uninstalling deletes your profiles and history.

---

## 📺 LG Smart TVs (webOS)

LG only lets you install your own apps through its **Developer Mode**, and you need a computer (Windows, Mac or Linux) on the same network as the TV.

### 1. Install

**One-time: turn on Developer Mode on the TV**

1. Create a free account at [webostv.developer.lge.com](https://webostv.developer.lge.com/).
2. On the TV, open the **LG Content Store**, search for **Developer Mode**, and install it.
3. Open **Developer Mode**, sign in with that account, and turn on **Dev Mode Status**. The TV restarts.
4. Open **Developer Mode** again, turn on **Key Server**, and note the TV's **IP address** shown in the app.

**One-time: connect your computer to the TV**

1. Install [Node.js](https://nodejs.org/) (the LTS version) on your computer.
2. Open a terminal / Command Prompt and install LG's tool:
   ```bash
   npm install -g @webos-tools/cli
   ```
3. Add your TV (replace `<TV-IP>` with the IP from the Developer Mode app):
   ```bash
   ares-setup-device -a lgtv -i "host=<TV-IP>" -i "port=9922" -i "username=prisoner"
   ```
4. Get the TV's key. When asked, type the **6-character passphrase** shown in the Developer Mode app (it's case-sensitive):
   ```bash
   ares-novacom --device lgtv --getkey
   ```

**Install Rush Flix**

1. Download the latest **`Rush-Flix_V….ipk`** from the [latest release](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases/latest) (under **Assets**).
2. In the terminal, from the folder you downloaded it to:
   ```bash
   ares-install -d lgtv Rush-Flix_V<version>.ipk
   ```
3. **Rush Flix** appears in the LG launcher.

> ⚠️ **Developer Mode expires.** The Developer Mode app shows how much time is left. Open it and press **Extend** before it runs out. **If it expires, LG uninstalls Rush Flix** and you'll need to install it again.

### 2. Set up

1. On first launch Rush Flix shows **Connect to TMDB**. The QR option only works in the Android app, so choose **Enter Manually**.
2. Enter your TMDB token (see [Before you start](#before-you-start-get-your-free-tmdb-token)). It's long, so to avoid typing it with the remote:
   - use the **Magic Remote** pointer on the on-screen keyboard, or
   - plug a **USB keyboard** into the TV and paste/type it.
3. **Create a profile:** pick a name and an emoji.
4. You're done. Pick something and press **Watch**. The Magic Remote pointer can click the player's own controls.

### 3. Updating

- Rush Flix tells you when a new version is out (Home screen banner, or **Settings → Playback → Check for updates**). The message includes the download link.
- LG doesn't allow apps to update themselves. Download the new `.ipk` and run the same `ares-install` command from your computer. Your data is kept.

---

## What Rush Flix can do

- **Browse & search** trending movies and TV shows, with posters, ratings, cast, trailers and "more like this". Anime gets richer details from [AniList](https://anilist.co/).
- **Pick up where you left off.** Continue Watching remembers the exact second, plus a Watchlist and Watch History.
- **Profiles** for everyone in the house (plus a Guest mode), each with their own progress and lists.
- **TV-first controls:** everything works with the remote, including play/pause, ±10 s skip, an episode list while watching, and a Next Episode button.
- **Live TV** from free [iptv-org](https://github.com/iptv-org/iptv) channels: search, filter by country, category or language, hide adult channels, and see the region when a channel is geo-blocked.
- **Parental limit:** hide titles above an age rating.
- **Personal touches:** accent colours, larger text, reorder home rows, intro-skip settings.
- **Your own videos:** add direct MP4/HLS links, shared libraries and Archive.org content (subtitles work for these).
- **Feedback** straight from the app (Settings → Feedback).

## What it can't do

- **No downloads** or offline viewing.
- **Some titles won't play.** Streaming exclusives (Netflix/Disney+/Amazon originals) often have no working stream, and new releases can take a while to appear.
- **One player.** Rush Flix plays through the Cineby player. If Cineby is down, nothing plays until it's back. The Android app follows Cineby automatically if it moves to a new web address.
- **No audio-language or quality choice.** That's decided by the player.
- **No subtitles for normal movies/shows.** Subtitles only work for your own direct video links.
- **Ads inside the player:** the Android app (TV, phone, Fire TV) has a built-in ad blocker — pop-ups, ad overlays (like fake "Confirm you're not a robot" QR codes) and trackers are blocked. New ad networks appear all the time, so one may occasionally slip through until the next update. On LG TVs and in browsers, ads may still appear.
- **Live TV:** many channels are region-locked (a VPN on your router helps), and there's no TV guide or recording.
- **Data stays on the device.** There's no cloud account; uninstalling deletes your profiles and history.
- **No casting** to other screens.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Invalid token"** during setup | You copied the short API Key. Copy the long `eyJ…` **API Read Access Token**. |
| **QR code scanned but nothing happens** | Phone and TV must be on the **same Wi-Fi**. Or use **Enter Manually**. |
| **"App not installed"** on Android | Don't uninstall first. Install the newer APK over the existing app. If it persists, open an [issue](https://github.com/Rushikesh-Nivalkar/Rush-Flix/issues). |
| **"Could not reach GitHub"** when checking for updates | On 2.5.0–2.7.0 that's a known bug. Install the latest version once by hand ([Android step 1](#1-install)). |
| **A title won't play** | Try again later. The player may not have that title yet, or it may be a streaming exclusive. |
| **A QR code / "Confirm you're not a robot" box appears** | It's a scam ad — **never scan it**. Update to the latest version (it blocks these); if it still appears, report it via Settings → Feedback. |
| **Rush Flix disappeared from my LG TV** | Developer Mode expired. Re-enable it and [install again](#-lg-smart-tvs-webos); remember to **Extend** it. |
| **Live TV channel won't load** | It's probably region-locked (the app shows the country). Try another channel or a VPN. |

Still stuck? Use **Settings → Feedback** in the app or open an [issue](https://github.com/Rushikesh-Nivalkar/Rush-Flix/issues).

---

## What's new

Release notes for every version are on the [Releases page](https://github.com/Rushikesh-Nivalkar/Rush-Flix/releases).

## For developers

Building from source, project structure, tech stack and the release process: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Legal Disclaimer

Rush Flix is a personal project intended for **educational and private use only**.

- Rush Flix does **not** host, store, cache, or distribute any video content
- All video streams come from a **third-party embed player** that Rush Flix has no affiliation with
- Responsibility for the legality of streamed content rests entirely with that third-party service and the end user
- Streaming copyrighted content without authorisation may be illegal in your country
- This project is **not affiliated** with Netflix, TMDB, LG, Google, or any streaming service

The author provides this code for educational purposes. **Use at your own risk.**

## Acknowledgements

- [TMDB](https://www.themoviedb.org/): movie and TV metadata
- [AniList](https://anilist.co/): anime metadata
- [AniSkip](https://aniskip.com/): anime intro/outro timings
- [iptv-org](https://github.com/iptv-org/iptv): free Live TV channel lists
- [HaGeZi DNS Blocklists](https://github.com/hagezi/dns-blocklists) (GPL-3.0): the ad/tracker list built into the Android app
- [StreamBert](https://github.com/truelockmc/streambert): original inspiration and architecture reference
