import { useEffect, useCallback } from "react";
import { getNextFocus } from "@bbc/tv-lrud-spatial";

export const TV_KEYS = {
  UP: ["ArrowUp"],
  DOWN: ["ArrowDown"],
  LEFT: ["ArrowLeft"],
  RIGHT: ["ArrowRight"],
  ENTER: ["Enter", " "],
  BACK: ["Backspace", "Escape", "GoBack"],
  PLAY_PAUSE: ["MediaPlayPause", "p"],
  FAST_FORWARD: ["MediaFastForward"],
  REWIND: ["MediaRewind"],
};

// Focusable selector compatible with lrud-spatial + our data-focusable convention
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  '[data-focusable]',
].join(", ");

function getFocusableElements(container) {
  const root = container || document.body;
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null,
  );
}

// Direction string → Arrow key string lrud-spatial understands
const DIR_KEY = {
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
};

export function useTVNavigation({ onBack } = {}) {
  const navigate = useCallback((direction) => {
    const active = document.activeElement;

    // Nothing focused or focus on body → focus first element
    if (!active || active === document.body) {
      getFocusableElements()[0]?.focus();
      return;
    }

    // lrud-spatial: container-priority edge-based navigation
    // Containers (nav, section, .lrud-container) try siblings first,
    // then expand to full document — no manual zone logic needed.
    const next = getNextFocus(active, DIR_KEY[direction]);
    if (next) {
      next.focus();
      next.scrollIntoView({
        block: direction === "up" ? "start" : "nearest",
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          navigate("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          navigate("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          navigate("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          navigate("right");
          break;
        case "Backspace":
        case "Escape":
        case "GoBack":
          // Don't intercept Backspace inside text inputs
          if (
            document.activeElement?.tagName === "INPUT" &&
            e.key === "Backspace"
          ) return;
          e.preventDefault();
          onBack?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, onBack]);

  return { navigate };
}

// Focus the first focusable element inside a container on mount
export function useFocusOnMount(containerRef) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      getFocusableElements(containerRef.current)[0]?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [containerRef]);
}
