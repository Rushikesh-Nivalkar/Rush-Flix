import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PlayIcon } from "./Icons";
import RushFlixLogo from "./RushFlixLogo";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function validateToken(token) {
  try {
    const pingRes = await fetch(`${TMDB_BASE}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    });
    if (pingRes.status === 401) return { ok: false, reason: "invalid_token" };
    if (pingRes.status === 403) return { ok: false, reason: "forbidden" };
    if (!pingRes.ok) return { ok: false, reason: "tmdb_error", status: pingRes.status };

    const testRes = await fetch(`${TMDB_BASE}/trending/movie/week`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    });
    if (!testRes.ok) return { ok: false, reason: "api_error", status: testRes.status };
    return { ok: true };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError")
      return { ok: false, reason: "timeout" };
    return { ok: false, reason: "unreachable" };
  }
}

function errorMessage(reason, status) {
  switch (reason) {
    case "invalid_token":
      return { title: "Invalid token", body: "TMDB rejected the token (401). Copy the long JWT Read Access Token, not the shorter API Key." };
    case "forbidden":
      return { title: "Access denied", body: "TMDB returned 403. Account may be suspended or token revoked." };
    case "timeout":
      return { title: "Request timed out", body: "TMDB took too long. Check internet connection and try again." };
    case "unreachable":
      return { title: "Cannot reach TMDB", body: "No connection to api.themoviedb.org. Check internet connection." };
    default:
      return { title: "Something went wrong", body: `TMDB returned an unexpected error${status ? ` (HTTP ${status})` : ""}. Try again.` };
  }
}

export default function SetupScreen({ onSave, onSkip, skipLabel }) {
  // Detect Capacitor (APK mode) vs web server mode
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());
  const apiBase = isCapacitor ? "http://localhost:8080" : "";

  const isLan = !isCapacitor && (
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  );

  const [tab, setTab] = useState("qr");
  const [deviceIp, setDeviceIp] = useState(null);

  // In APK mode, fetch device's LAN IP from NanoHTTPD
  useEffect(() => {
    if (!isCapacitor) return;
    fetch("http://localhost:8080/api/my-ip")
      .then((r) => r.json())
      .then((d) => { if (d.ip) setDeviceIp(d.ip); })
      .catch(() => {});
  }, [isCapacitor]);

  const phoneUrl = isCapacitor
    ? (deviceIp ? `http://${deviceIp}:8080/?setup=phone` : null)
    : (isLan ? `http://${window.location.host}/?setup=phone` : null);

  // Manual entry state
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // QR polling state
  const [pollStatus, setPollStatus] = useState("waiting"); // waiting | validating | error
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Focus manual input when switching to manual tab
  useEffect(() => {
    if (tab === "manual") {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [tab]);

  // Poll token-status every 2s when QR tab is active
  useEffect(() => {
    if (tab !== "qr" || !phoneUrl) return;
    setPollStatus("waiting");
    setError(null);

    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/token-status`);
        const data = await res.json();
        if (!data.token) return;

        clearInterval(intervalId);
        setPollStatus("validating");
        const result = await validateToken(data.token);
        if (result.ok) {
          onSaveRef.current(data.token);
        } else {
          setPollStatus("error");
          setError(errorMessage(result.reason, result.status));
        }
      } catch {}
    };

    const intervalId = setInterval(poll, 2000);
    return () => clearInterval(intervalId);
  }, [tab, phoneUrl, apiBase]);

  // Manual submit
  const handleSubmit = async () => {
    const token = key.trim();
    if (!token) return;
    setChecking(true);
    setError(null);
    const result = await validateToken(token);
    setChecking(false);
    if (result.ok) onSave(token);
    else setError(errorMessage(result.reason, result.status));
  };

  return (
    <div className="apikey-modal">
      <div className="apikey-box">
        <div className="setup-logo"><RushFlixLogo size="md" /></div>
        <div className="apikey-title">Connect to TMDB</div>

        {/* Tab switcher — always visible */}
        <div className="setup-tabs">
          <button
            className={`setup-tab tv-focusable${tab === "qr" ? " active" : ""}`}
            tabIndex={0}
            onClick={() => { setTab("qr"); setError(null); }}
          >
            📱 Scan with Phone
          </button>
          <button
            className={`setup-tab tv-focusable${tab === "manual" ? " active" : ""}`}
            tabIndex={0}
            onClick={() => { setTab("manual"); setError(null); }}
          >
            ⌨ Enter Manually
          </button>
        </div>

        {/* ── QR tab ─────────────────────────────────────────────── */}
        {tab === "qr" && (
          <div className="setup-qr-panel">
            {phoneUrl ? (
              <>
                <p className="apikey-sub">
                  Scan with your phone. Enter your TMDB token there —
                  the TV receives it automatically.
                </p>

                <div className="setup-qr-wrap">
                  <QRCodeSVG
                    value={phoneUrl}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>

                <p className="setup-qr-url">{phoneUrl}</p>

                {pollStatus === "waiting" && (
                  <div className="setup-poll-row">
                    <span className="setup-poll-dot" />
                    Waiting for phone…
                  </div>
                )}
                {pollStatus === "validating" && (
                  <div className="setup-poll-row">
                    <span className="apikey-spinner" />
                    Validating token…
                  </div>
                )}
                {pollStatus === "error" && error && (
                  <div className="apikey-error-box">
                    <div className="apikey-error-title">⚠ {error.title}</div>
                    <div className="apikey-error-body">{error.body}</div>
                    <button
                      className="tv-btn tv-btn-ghost tv-focusable"
                      tabIndex={0}
                      style={{ marginTop: 8 }}
                      onClick={() => { setPollStatus("waiting"); setError(null); }}
                    >
                      Try again
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="setup-localhost-note">
                {isCapacitor ? (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
                    <p className="apikey-sub">
                      Getting device IP… make sure the TV is connected to Wi-Fi.
                      <br /><br />
                      Or use <strong>Enter Manually</strong> to paste the token directly.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
                    <p className="apikey-sub">
                      Phone setup requires the app to be served over your local network.
                      <br /><br />
                      Run <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>npm run serve</code> and
                      open the app via your PC&apos;s IP address (e.g.{" "}
                      <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>http://192.168.x.x:4173</code>).
                      <br /><br />
                      Or use <strong>Enter Manually</strong> to paste the token directly.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Manual tab ──────────────────────────────────────────── */}
        {tab === "manual" && (
          <>
            <p className="apikey-sub">
              Go to{" "}
              <a
                className="apikey-link"
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noreferrer"
              >
                themoviedb.org → Settings → API
              </a>
              {" "}— copy the <em>API Read Access Token</em> (long JWT, starts with eyJ…).
              <br /><br />
              Skip this to use personal media, shared library, and friends&apos; picks without TMDB.
            </p>

            <input
              className={`apikey-input${error ? " apikey-input-error" : ""}`}
              placeholder="Paste TMDB Read Access Token (eyJ…)"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && !checking && handleSubmit()}
              ref={inputRef}
              disabled={checking}
            />

            {error && (
              <div className="apikey-error-box">
                <div className="apikey-error-title">⚠ {error.title}</div>
                <div className="apikey-error-body">{error.body}</div>
              </div>
            )}

            <button
              className="btn btn-primary tv-focusable"
              tabIndex={0}
              style={{ width: "100%", justifyContent: "center", padding: "13px", marginTop: error ? 0 : undefined }}
              onClick={handleSubmit}
              disabled={!key.trim() || checking}
            >
              {checking ? <><span className="apikey-spinner" /> Checking…</> : <><PlayIcon /> Connect</>}
            </button>
          </>
        )}

        {onSkip && (
          <button
            className="tv-btn tv-btn-ghost tv-focusable setup-skip-btn"
            tabIndex={0}
            onClick={onSkip}
          >
            {skipLabel || "Skip — use without TMDB"}
          </button>
        )}
      </div>
    </div>
  );
}
