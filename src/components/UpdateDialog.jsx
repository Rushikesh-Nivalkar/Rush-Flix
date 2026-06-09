import { useEffect, useRef } from "react";
import { useApkUpdater } from "../hooks/useApkUpdater";
import { APP_VERSION } from "../utils/updateChecker";

/**
 * Update installation dialog — shared between HomePage and SettingsPage.
 *
 * TV D-pad:
 *   ArrowRight from Install → focuses Later
 *   ArrowLeft  from Later   → focuses Install
 *   Escape / GoBack         → onDismiss()
 *   Overlay click outside card → onDismiss()
 *
 * Props:
 *   latestVersion  string        e.g. "v1.1.2"
 *   apkUrl         string|null   browser_download_url for the APK asset
 *   releaseNotes   string        GitHub release body text
 *   onDismiss      fn()          called when user closes dialog
 */
export default function UpdateDialog({ latestVersion, apkUrl, releaseNotes, onDismiss }) {
  const updater = useApkUpdater();
  const installRef = useRef(null);
  const laterRef = useRef(null);
  const isNative = !!(window.RushFlixUpdater);
  const isDownloading = updater.state === "downloading";
  const isInstalling = updater.state === "installing";
  const isError = updater.state === "error";
  const isIdle =
    updater.state === "idle" ||
    updater.state === "cancelled" ||
    updater.state === "permission_needed";

  const handleInstall = () => {
    if (!apkUrl) return;
    updater.download(apkUrl);
  };

  const handleDismiss = () => {
    if (updater.state === "downloading") updater.cancel();
    else updater.reset();
    onDismiss();
  };

  // Focus primary button on mount
  useEffect(() => {
    const t = setTimeout(() => {
      (isNative && apkUrl ? installRef.current : laterRef.current)?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // D-pad focus trap + back key (capture phase — intercepts before tvNav.js)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDismiss();
        return;
      }
      const active = document.activeElement;
      if (e.key === "ArrowRight" && active === installRef.current) {
        e.preventDefault();
        laterRef.current?.focus();
      }
      if (e.key === "ArrowLeft" && active === laterRef.current) {
        e.preventDefault();
        installRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handleDismiss]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtBytes = (n) => {
    if (!n) return "";
    return n < 1048576
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "36px 40px", maxWidth: 480, width: "90%",
          boxShadow: "0 28px 72px rgba(0,0,0,0.65)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          Update Available
        </div>

        {/* Version row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <code style={{
            fontSize: 13, color: "var(--text3)", background: "var(--surface2)",
            border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px",
          }}>v{APP_VERSION}</code>
          <span style={{ color: "var(--text3)" }}>→</span>
          <code style={{
            fontSize: 14, fontWeight: 700, color: "var(--text)",
            background: "rgba(229,9,20,0.12)", border: "1px solid rgba(229,9,20,0.3)",
            borderRadius: 6, padding: "3px 10px",
          }}>{latestVersion}</code>
        </div>

        {/* Release notes */}
        {releaseNotes ? (
          <div style={{
            fontSize: 13, color: "var(--text2)", lineHeight: 1.6, marginBottom: 20,
            maxHeight: 100, overflowY: "auto", background: "var(--surface2)",
            borderRadius: 8, padding: "10px 14px", border: "1px solid var(--border)",
            whiteSpace: "pre-wrap",
          }}>{releaseNotes}</div>
        ) : null}

        {/* No APK attached to release */}
        {!apkUrl && isIdle && (
          <div style={{
            fontSize: 12, color: "var(--text3)", marginBottom: 20,
            padding: "8px 12px", background: "rgba(229,9,20,0.07)",
            borderRadius: 6, border: "1px solid rgba(229,9,20,0.2)",
          }}>
            {isNative
              ? "No APK asset found in this release. Download manually from GitHub."
              : "Running in browser — download the APK on your Android TV instead."}
          </div>
        )}

        {/* Web context — no RushFlixUpdater bridge */}
        {!isNative && apkUrl && isIdle && (
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>
            Running in browser — sideload this APK on your Android TV:
            <br />
            <a href={apkUrl} target="_blank" rel="noreferrer"
              style={{ color: "var(--red)", wordBreak: "break-all" }}>
              {apkUrl}
            </a>
          </div>
        )}

        {/* Download progress */}
        {isDownloading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              height: 6, background: "var(--surface2)", borderRadius: 3,
              overflow: "hidden", marginBottom: 8,
            }}>
              <div style={{
                width: `${updater.percent}%`, height: "100%",
                background: "var(--red)", borderRadius: 3, transition: "width 0.3s",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              Downloading… {updater.percent}%
              {updater.total > 0
                ? ` (${fmtBytes(updater.downloaded)} / ${fmtBytes(updater.total)})`
                : ""}
            </div>
          </div>
        )}

        {isInstalling && (
          <div style={{ fontSize: 13, color: "#48c774", fontWeight: 500, marginBottom: 20 }}>
            Installing… The app will restart automatically.
          </div>
        )}

        {isError && (
          <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 20 }}>
            ✕ Download failed: {updater.error || "Unknown error."}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          {isNative && apkUrl && (isIdle || isError) && (
            <button
              ref={installRef}
              className="btn tv-focusable"
              style={{ flex: 1, background: "var(--red)", color: "#fff", border: "none", fontWeight: 600 }}
              onClick={handleInstall}
            >
              Install {latestVersion}
            </button>
          )}

          {isDownloading && (
            <button
              className="btn btn-ghost tv-focusable"
              style={{ flex: 1 }}
              onClick={handleDismiss}
            >
              Cancel Download
            </button>
          )}

          {(isIdle || isError) && (
            <button
              ref={laterRef}
              className="btn btn-ghost tv-focusable"
              onClick={handleDismiss}
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
