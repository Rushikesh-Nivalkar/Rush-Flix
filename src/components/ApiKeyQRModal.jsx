import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function ApiKeyQRModal({ setupType, label, onSave, onClose }) {
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());
  const apiBase = isCapacitor ? "http://localhost:8080" : "";
  const isLan = !isCapacitor &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  const [deviceIp, setDeviceIp] = useState(null);
  const [pollStatus, setPollStatus] = useState("waiting"); // waiting | received
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // APK: fetch device LAN IP
  useEffect(() => {
    if (!isCapacitor) return;
    fetch("http://localhost:8080/api/my-ip")
      .then((r) => r.json())
      .then((d) => { if (d.ip) setDeviceIp(d.ip); })
      .catch(() => {});
  }, [isCapacitor]);

  const phoneUrl = isCapacitor
    ? (deviceIp ? `http://${deviceIp}:8080/?setup=${setupType}` : null)
    : (isLan ? `http://${window.location.host}/?setup=${setupType}` : null);

  // Flush stale token on mount, then poll every 2s
  useEffect(() => {
    if (!phoneUrl) return;
    // Consume any stale token from a prior session
    fetch(`${apiBase}/api/token-status`).catch(() => {});

    const idRef = { current: null };
    const timeout = setTimeout(() => {
      const poll = async () => {
        try {
          const res = await fetch(`${apiBase}/api/token-status`);
          const data = await res.json();
          if (!data.token) return;
          clearInterval(idRef.current);
          setPollStatus("received");
          onSaveRef.current(data.token.trim());
        } catch {}
      };
      idRef.current = setInterval(poll, 2000);
    }, 1000);

    return () => {
      clearTimeout(timeout);
      if (idRef.current) clearInterval(idRef.current);
    };
  }, [phoneUrl, apiBase]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface, #1a1a1a)", borderRadius: 16,
          padding: "32px 28px", maxWidth: 400, width: "90%", textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text, #fff)", marginBottom: 8 }}>
          Set {label} via Phone
        </div>

        {!phoneUrl ? (
          <p style={{ fontSize: 13, color: "var(--text3, #888)", margin: "16px 0" }}>
            QR pairing is only available on the TV app (APK mode).
          </p>
        ) : pollStatus === "received" ? (
          <div style={{ padding: "24px 0" }}>
            <div style={{ fontSize: 48, color: "#22c55e", marginBottom: 12 }}>✓</div>
            <p style={{ color: "#aaa", fontSize: 14 }}>Key received and saved.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--text3, #888)", margin: "8px 0 20px" }}>
              Scan with your phone to enter your {label}.
            </p>
            <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 8 }}>
              <QRCodeSVG value={phoneUrl} size={180} bgColor="#ffffff" fgColor="#000000" level="M" />
            </div>
            <p style={{ fontSize: 11, color: "var(--text3, #888)", marginTop: 10, wordBreak: "break-all" }}>
              {phoneUrl}
            </p>
            <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>
              Waiting for phone…
            </p>
          </>
        )}

        <button
          className="btn btn-ghost"
          style={{ marginTop: 20, padding: "8px 24px", fontSize: 13 }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
