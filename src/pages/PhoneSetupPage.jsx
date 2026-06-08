import { useState, useEffect } from "react";
import RushFlixLogo from "../components/RushFlixLogo";

const SETUP_CONFIG = {
  phone: {
    title: "Add TMDB Token",
    hint: (
      <>
        Go to{" "}
        <a href="https://www.themoviedb.org/settings/api" style={{ color: "#e50914" }} target="_blank" rel="noreferrer">
          themoviedb.org → Settings → API
        </a>{" "}
        and copy the <strong>API Read Access Token</strong> (long JWT starting with eyJ…).
      </>
    ),
    placeholder: "Paste token here (eyJ…)",
    inputRows: 5,
    inputFont: "monospace",
  },
  wyzie: {
    title: "Add Wyzie API Key",
    hint: (
      <>
        Go to{" "}
        <a href="https://sub.wyzie.io" style={{ color: "#e50914" }} target="_blank" rel="noreferrer">
          sub.wyzie.io
        </a>{" "}
        and claim a free key (no account needed). Paste the key below.
      </>
    ),
    placeholder: "wyzie-…",
    inputRows: 2,
    inputFont: "system-ui, sans-serif",
  },
  subdl: {
    title: "Add SubDL API Key",
    hint: (
      <>
        Register at{" "}
        <a href="https://subdl.com/settings" style={{ color: "#e50914" }} target="_blank" rel="noreferrer">
          subdl.com → Settings
        </a>{" "}
        and copy your API key. Paste it below.
      </>
    ),
    placeholder: "SubDL API key…",
    inputRows: 2,
    inputFont: "system-ui, sans-serif",
  },
};

export default function PhoneSetupPage() {
  const setupType = new URLSearchParams(window.location.search).get("setup") || "phone";
  const config = SETUP_CONFIG[setupType] || SETUP_CONFIG.phone;
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error

  // Override TV cursor:none so phone users see a normal cursor
  useEffect(() => {
    document.body.classList.add("phone-setup");
    return () => document.body.classList.remove("phone-setup");
  }, []);

  async function handleSubmit() {
    const t = token.trim();
    if (!t) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/submit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <RushFlixLogo size="md" animate={false} />
        <h1 style={s.title}>{config.title}</h1>

        {status === "done" ? (
          <div style={s.doneWrap}>
            <div style={s.check}>✓</div>
            <p style={s.doneText}>Key received. Check your TV — it should load now.</p>
          </div>
        ) : (
          <>
            <p style={s.hint}>{config.hint}</p>

            <textarea
              style={{ ...s.input, fontFamily: config.inputFont }}
              placeholder={config.placeholder}
              value={token}
              onChange={(e) => { setToken(e.target.value); if (status === "error") setStatus("idle"); }}
              rows={config.inputRows}
              autoFocus
            />

            {status === "error" && (
              <p style={s.error}>
                Could not reach TV. Make sure your phone and TV are on the same Wi-Fi network.
              </p>
            )}

            <button
              style={{ ...s.btn, opacity: !token.trim() || status === "submitting" ? 0.5 : 1 }}
              onClick={handleSubmit}
              disabled={!token.trim() || status === "submitting"}
            >
              {status === "submitting" ? "Sending…" : "Send to TV"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1a1a1a",
    borderRadius: "16px",
    padding: "32px 24px",
    maxWidth: "480px",
    width: "100%",
    textAlign: "center",
    boxSizing: "border-box",
  },
  logo: {
    fontSize: "20px",
    fontWeight: "900",
    letterSpacing: "0.15em",
    color: "#e50914",
    marginBottom: "8px",
  },
  title: { fontSize: "20px", fontWeight: "700", color: "#fff", margin: "0 0 16px" },
  hint: { fontSize: "14px", color: "#aaa", lineHeight: 1.7, marginBottom: "20px", textAlign: "left" },
  link: { color: "#e50914" },
  input: {
    width: "100%",
    background: "#111",
    border: "1px solid #333",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "13px",
    padding: "12px",
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "monospace",
  },
  error: { color: "#e50914", fontSize: "13px", margin: "10px 0 0", textAlign: "left" },
  btn: {
    marginTop: "20px",
    width: "100%",
    background: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "16px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  doneWrap: { padding: "24px 0" },
  check: { fontSize: "52px", color: "#22c55e", marginBottom: "12px" },
  doneText: { color: "#aaa", fontSize: "16px", lineHeight: 1.6 },
};
