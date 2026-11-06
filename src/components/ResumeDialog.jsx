import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const fmtTime = (s) => {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Part-watched episode: resume or start over. data-nav-trap keeps the remote inside
// (tvNav); Back cancels, via the keys here or window.__dialogClose on Android.
export default function ResumeDialog({ title, seconds, onResume, onRestart, onCancel }) {
  const resumeRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    resumeRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    window.__dialogClose = onCancel;
    const handler = (e) => {
      if (e.key !== "Escape" && e.key !== "Backspace" && e.key !== "GoBack") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.__dialogClose = null;
      window.removeEventListener("keydown", handler, true);
    };
  }, [onCancel]);

  return createPortal(
    <div
      data-nav-trap
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "36px 40px",
          maxWidth: "90%",
          textAlign: "center",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: "1.33rem", fontWeight: 600, marginBottom: 24 }}>{title}</div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button ref={resumeRef} className="tv-btn tv-btn-primary tv-focusable" tabIndex={0} onClick={onResume}>
            Resume from {fmtTime(seconds)}
          </button>
          <button className="tv-btn tv-btn-ghost tv-focusable" tabIndex={0} onClick={onRestart}>
            Start from beginning
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
