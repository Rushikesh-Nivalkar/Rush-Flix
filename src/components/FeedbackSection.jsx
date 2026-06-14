import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { APP_VERSION } from "../utils/updateChecker";

const ISSUE_TYPES = [
  { value: "bug", label: "Bug Report", emoji: "🐛" },
  { value: "feature", label: "Feature Request", emoji: "✨" },
  { value: "feedback", label: "General Feedback", emoji: "💬" },
];

const feedbackToken = import.meta.env.VITE_FEEDBACK_TOKEN || "";
const FEEDBACK_FORM_URL = `https://rushikesh-nivalkar.github.io/Rush-Flix/feedback.html?t=${encodeURIComponent(feedbackToken)}&v=${encodeURIComponent(APP_VERSION)}`;

function buildIssueTitle(type, body) {
  const prefix = ISSUE_TYPES.find((t) => t.value === type)?.label || "Feedback";
  const snippet = body.trim().slice(0, 60).replace(/\n/g, " ");
  return `[${prefix}] ${snippet}${body.trim().length > 60 ? "…" : ""}`;
}

function buildIssueBody(type, body) {
  const typeLabel = ISSUE_TYPES.find((t) => t.value === type)?.label || type;
  return [
    `**Type:** ${typeLabel}`,
    `**App Version:** ${APP_VERSION}`,
    `**Platform:** Android TV / Rush Flix APK`,
    "",
    "---",
    "",
    body.trim(),
  ].join("\n");
}

export default function FeedbackSection() {
  const [type, setType] = useState("bug");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [issueUrl, setIssueUrl] = useState("");

  const token = import.meta.env.VITE_FEEDBACK_TOKEN || "";

  async function handleSubmit() {
    if (!body.trim()) return;
    if (!token) {
      setErrorMsg("Feedback token not configured. Add VITE_FEEDBACK_TOKEN to .env.local and rebuild.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch(
        "https://api.github.com/repos/Rushikesh-Nivalkar/Rush-Flix/issues",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "rush-flix-feedback",
          },
          body: JSON.stringify({
            title: buildIssueTitle(type, body),
            body: buildIssueBody(type, body),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIssueUrl(data.html_url || "");
      setStatus("success");
      setBody("");
      setType("bug");
    } catch (e) {
      setErrorMsg(e.message || "Network error — check internet connection.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="feedback-section">
        <div className="feedback-success">
          <div className="feedback-success-icon">✓</div>
          <div className="feedback-success-title">Feedback submitted</div>
          {issueUrl && (
            <div className="feedback-success-url">{issueUrl}</div>
          )}
          <button
            className="tv-btn tv-btn-ghost tv-focusable"
            tabIndex={0}
            onClick={() => setStatus("idle")}
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-section">
      <div className="feedback-qr-row">
        <div className="feedback-qr-wrap">
          <QRCodeSVG
            value={FEEDBACK_FORM_URL}
            size={120}
            bgColor="#ffffff"
            fgColor="#111111"
          />
        </div>
        <div className="feedback-qr-hint">
          <p className="feedback-qr-label">Scan to submit from your phone</p>
          <p className="feedback-qr-sub">Opens Rush Flix feedback form — no account needed</p>
        </div>
      </div>

      <div className="feedback-divider">— or submit directly —</div>

      <div className="feedback-form">
        <label className="feedback-label">Type</label>
        <select
          className="tv-input feedback-select tv-focusable"
          tabIndex={0}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {ISSUE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>

        <label className="feedback-label">Description</label>
        <textarea
          className="tv-input feedback-textarea tv-focusable"
          tabIndex={0}
          rows={5}
          placeholder="Describe the bug, feature, or feedback…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
        <div className="feedback-char-count">{body.length}/2000</div>

        {status === "error" && (
          <div className="feedback-error">{errorMsg}</div>
        )}

        <button
          className="tv-btn tv-btn-primary tv-focusable"
          tabIndex={0}
          disabled={!body.trim() || status === "submitting"}
          onClick={handleSubmit}
        >
          {status === "submitting" ? "Submitting…" : "Submit Feedback"}
        </button>
      </div>
    </div>
  );
}
