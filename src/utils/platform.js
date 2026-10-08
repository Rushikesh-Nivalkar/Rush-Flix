export const isWebOS = /Web0S|webOS|LG Browser/i.test(navigator.userAgent) ||
                       typeof window.webOS !== "undefined";

export const isCapacitorNative = !!(window?.Capacitor?.isNativePlatform?.());

// Android: stop the TV screensaver while a video is actually playing.
// `reason` lets several players ("live", "video") hold it independently;
// the screen may sleep again once every reason is off (paused / closed).
export function keepAwake(reason, on) {
  try { window.RushFlixBridge?.setKeepAwake?.(reason, !!on); } catch { /* not Android */ }
}
