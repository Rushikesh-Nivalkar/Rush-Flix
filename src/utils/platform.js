export const isWebOS = /Web0S|webOS|LG Browser/i.test(navigator.userAgent) ||
                       typeof window.webOS !== "undefined";

export const isCapacitorNative = !!(window?.Capacitor?.isNativePlatform?.());
