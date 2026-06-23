import { useEffect, useRef } from "react";
import { useApkUpdater } from "../hooks/useApkUpdater";
import { APP_VERSION } from "../utils/updateChecker";
import { isWebOS } from "../utils/platform";

/**
 * Update installation dialog — shared between HomePage and SettingsPage.
 *
 * Auto-starts download on mount when running in native APK with a valid APK URL.
 * Shows progress bar, handles permission_needed, error, and install states.
 * D-pad: Escape / GoBack → onDismiss()
 */
export default function UpdateDialog({ latestVersion, apkUrl, ipkUrl, releaseNotes, onDismiss }) {
  const updater = useApkUpdater();
  const primaryRef = useRef(null);
  const cancelRef = useRef(null);
  const isNative = !!(window.RushFlixUpdater);
  const isDownloading = updater.state === "downloading";
  const isInstalling = updater.state === "installing";
  const isError = updater.state === "error";
  const isPermissionNeeded = updater.state === "permission_needed";
  const isCancelled = updater.state === "cancelled";
  const isIdle = updater.state === "idle";
  const showTryAgain = isNative && apkUrl && (isError || isPermissionNeeded || isCancelled);

  // Auto-start download on mount when native + APK URL available
  useEffect(() => {
    if (isNative && apkUrl) {
      updater.download(apkUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus cancel/primary button on mount
  useEffect(() => {
    const t = setTimeout(() => {
      (showTryAgain ? primaryRef.current : cancelRef.current)?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // D-pad focus + back key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDismiss();
        return;
      }
      const active = document.activeElement;
      if (e.key === "ArrowRight" && active === primaryRef.current) {
        e.preventDefault();
        cancelRef.current?.focus();
      }
      if (e.key === "ArrowLeft" && active === cancelRef.current) {
        e.preventDefault();
        primaryRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = () => {
    if (isDownloading) updater.cancel();
    else updater.reset();
    onDismiss();
  };

  const handleTryAgain = () => {
    updater.download(apkUrl);
  };

  const fmtBytes = (n) => {
    if (!n) return "";
    return n < 1048576
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
  };

  // ── webOS: can't auto-install IPK, show download link + ares-install hint ──
  if (isWebOS) {
    const latestClean = (latestVersion || "").replace(/^v/, "");
    return (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
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
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Update Available</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <code style={{ fontSize: 13, color: "var(--text3)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px" }}>v{APP_VERSION}</code>
            <span style={{ color: "var(--text3)" }}>→</span>
            <code style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", background: "rgba(229,9,20,0.12)", border: "1px solid rgba(229,9,20,0.3)", borderRadius: 6, padding: "3px 10px" }}>{latestVersion}</code>
          </div>
          {releaseNotes ? (
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, marginBottom: 20, maxHeight: 80, overflowY: "auto", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--border)", whiteSpace: "pre-wrap" }}>{releaseNotes}</div>
          ) : null}
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
            Download the IPK and install from your computer:
          </div>
          <code style={{ display: "block", fontSize: 12, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "var(--red)", wordBreak: "break-all" }}>
            ares-install Rush-Flix_V{latestClean}.ipk
          </code>
          {ipkUrl && (
            <a href={ipkUrl} target="_blank" rel="noreferrer"
              style={{ display: "block", fontSize: 12, color: "var(--red)", marginBottom: 20, wordBreak: "break-all" }}>
              Download Rush-Flix_V{latestClean}.ipk from GitHub
            </a>
          )}
          <button ref={cancelRef} className="btn btn-ghost tv-focusable" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    );
  }

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

        {/* No APK attached */}
        {!apkUrl && (
          <div style={{
            fontSize: 12, color: "var(--text3)", marginBottom: 20,
            padding: "8px 12px", background: "rgba(229,9,20,0.07)",
            borderRadius: 6, border: "1px solid rgba(229,9,20,0.2)",
          }}>
            {isNative
              ? "No APK asset found in this release. Create the GitHub release with the APK attached."
              : "Running in browser — download the APK on your Android TV instead."}
          </div>
        )}

        {/* Web context — no bridge */}
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

        {/* Auto-starting (brief flash before first progress event) */}
        {isNative && apkUrl && isIdle && (
          <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
            Starting download…
          </div>
        )}

        {/* Permission needed */}
        {isPermissionNeeded && (
          <div style={{
            fontSize: 13, color: "var(--text2)", marginBottom: 20,
            padding: "10px 14px", background: "rgba(255,160,0,0.1)",
            borderRadius: 8, border: "1px solid rgba(255,160,0,0.3)",
          }}>
            Grant <strong>Install unknown apps</strong> for Rush Flix in the Settings screen that just opened, then tap <strong>Try Again</strong>.
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

        {isCancelled && (
          <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
            Download cancelled.
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          {showTryAgain && (
            <button
              ref={primaryRef}
              className="btn tv-focusable"
              style={{ flex: 1, background: "var(--red)", color: "#fff", border: "none", fontWeight: 600 }}
              onClick={handleTryAgain}
            >
              Try Again
            </button>
          )}

          {isDownloading && (
            <button
              ref={cancelRef}
              className="btn btn-ghost tv-focusable"
              style={{ flex: 1 }}
              onClick={handleDismiss}
            >
              Cancel Download
            </button>
          )}

          {!isDownloading && !isInstalling && (
            <button
              ref={cancelRef}
              className="btn btn-ghost tv-focusable"
              onClick={handleDismiss}
            >
              {isError || isCancelled ? "Close" : "Later"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
