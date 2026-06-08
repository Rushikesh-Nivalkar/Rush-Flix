import { useState, useEffect, useCallback } from "react";

// Bridges window.RushFlixUpdater (Android JavascriptInterface) into React state.
// No-ops silently in browser/dev — the interface is only injected in the APK.
export function useApkUpdater() {
  const [state, setState] = useState("idle");
  // state: 'idle' | 'permission_needed' | 'downloading' | 'installing' | 'error' | 'cancelled'
  const [percent, setPercent] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onMessage(e) {
      const d = e.data;
      if (!d || typeof d.type !== "string") return;
      switch (d.type) {
        case "rushflix_update_progress":
          setState("downloading");
          setPercent(d.percent ?? 0);
          setDownloaded(d.downloaded ?? 0);
          setTotal(d.total ?? 0);
          break;
        case "rushflix_update_complete":
          setState("installing");
          break;
        case "rushflix_update_error":
          setState("error");
          setError(d.message ?? "Unknown error");
          break;
        case "rushflix_update_permission_needed":
          setState("permission_needed");
          break;
        case "rushflix_update_cancelled":
          setState("idle");
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const download = useCallback((url) => {
    setState("downloading");
    setPercent(0);
    setError(null);
    window.RushFlixUpdater?.downloadAndInstall(url);
  }, []);

  const cancel = useCallback(() => {
    window.RushFlixUpdater?.cancelDownload();
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setPercent(0);
    setError(null);
  }, []);

  return { state, percent, downloaded, total, error, download, cancel, reset };
}
