import { useEffect, useCallback } from "react";

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

// Scroll .tv-main to keep the focused element visible.
function scrollMainToShow(el, direction) {
  const mainEl = document.querySelector(".tv-main");
  if (!mainEl) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
  const elRect = el.getBoundingClientRect();
  const mainRect = mainEl.getBoundingClientRect();
  const stickyHeader = document.querySelector("[data-settings-header]");
  const topOffset = 80 + (stickyHeader ? stickyHeader.getBoundingClientRect().height : 0);
  if (direction === "up" && elRect.top < mainRect.top + topOffset) {
    mainEl.scrollBy({ top: elRect.top - mainRect.top - topOffset, behavior: "smooth" });
  } else if (direction === "down" && elRect.bottom > mainRect.bottom - 16) {
    mainEl.scrollBy({ top: elRect.bottom - mainRect.bottom + 16, behavior: "smooth" });
  }
}

// ── Row-based spatial navigation ──────────────────────────────────────────────
// Groups all visible focusable elements into horizontal rows by vertical center.
// Elements within ROW_THRESHOLD px of each other share a row.
// Within a row: Left/Right. Between rows: Up/Down (nearest X wins).

const ROW_THRESHOLD = 30;

function buildRows(elements) {
  const items = elements.map((el) => {
    const r = el.getBoundingClientRect();
    return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  const rows = [];
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.cy - item.cy) <= ROW_THRESHOLD);
    if (row) {
      row.items.push(item);
      row.cy = row.items.reduce((s, i) => s + i.cy, 0) / row.items.length;
    } else {
      rows.push({ cy: item.cy, items: [item] });
    }
  }

  rows.sort((a, b) => a.cy - b.cy);
  rows.forEach((row) => row.items.sort((a, b) => a.cx - b.cx));
  return rows;
}

function closestCx(items, targetCx) {
  return items.reduce((best, item) =>
    Math.abs(item.cx - targetCx) < Math.abs(best.cx - targetCx) ? item : best,
  );
}

function getNextFocus(activeEl, direction) {
  const elements = getFocusableElements();
  if (!elements.length) return null;
  if (!elements.includes(activeEl)) return elements[0];

  const rows = buildRows(elements);
  let rowIdx = -1;
  let colIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].items.findIndex((i) => i.el === activeEl);
    if (c >= 0) { rowIdx = r; colIdx = c; break; }
  }
  if (rowIdx === -1) return null;

  const row = rows[rowIdx];
  const activeItem = row.items[colIdx];

  switch (direction) {
    case "right":
      return colIdx < row.items.length - 1 ? row.items[colIdx + 1].el : null;
    case "left":
      return colIdx > 0 ? row.items[colIdx - 1].el : null;
    case "down":
      return rowIdx < rows.length - 1
        ? closestCx(rows[rowIdx + 1].items, activeItem.cx).el
        : null;
    case "up":
      return rowIdx > 0
        ? closestCx(rows[rowIdx - 1].items, activeItem.cx).el
        : null;
    default:
      return null;
  }
}

export function useTVNavigation({ onBack } = {}) {
  const navigate = useCallback((direction) => {
    const active = document.activeElement;

    if (!active || active === document.body) {
      getFocusableElements()[0]?.focus();
      return;
    }

    const next = getNextFocus(active, direction);
    if (next) {
      // When navigating up into the navbar, land on the currently active tab
      const navbar = document.querySelector(".tv-navbar");
      if (direction === "up" && navbar && navbar.contains(next)) {
        const activeBtn = navbar.querySelector("[data-nav-active='true']");
        (activeBtn || next).focus();
      } else {
        next.focus();
      }
      scrollMainToShow(next, direction);
    } else if (direction === "up") {
      const mainEl = document.querySelector(".tv-main");
      if (mainEl && mainEl.scrollTop > 0) {
        mainEl.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => getFocusableElements()[0]?.focus(), 300);
      }
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      switch (e.key) {
        case "ArrowUp":    e.preventDefault(); navigate("up");    break;
        case "ArrowDown":  e.preventDefault(); navigate("down");  break;
        case "ArrowLeft":  e.preventDefault(); navigate("left");  break;
        case "ArrowRight": e.preventDefault(); navigate("right"); break;
        case "Backspace":
        case "Escape":
        case "GoBack":
          if (document.activeElement?.tagName === "INPUT" && e.key === "Backspace") return;
          e.preventDefault();
          onBack?.();
          break;
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, onBack]);

  return { navigate };
}

export function useFocusOnMount(containerRef) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      getFocusableElements(containerRef.current)[0]?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [containerRef]);
}
