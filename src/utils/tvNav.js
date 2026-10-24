import { useEffect, useCallback } from "react";

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

// Scroll .tv-main so the focused element sits in the visible band below the fixed
// navbar (content scrolls UNDER it). One absolute scroll target per press — the
// browser's own focus scroll is suppressed (preventScroll) — so fast presses
// converge instead of compounding half-finished smooth scrolls.
//  - Anything that fits on the first screen → scroll to the top (hero, first rows).
//  - Inside a row section that fits → section top just under the navbar
//    (title + genre picker + cards all visible, Netflix-style).
//  - Otherwise → minimal scroll to bring the element inside the band.
const NAV_BLOCKS = ".section, .library-section";
// Inner vertical scroll boxes (Live TV channel list, panels, dialogs): the
// browser's focus scroll is off, so bring the element inside each of them.
// Returns the outermost such box (the page then scrolls to show the box).
function scrollInnerToShow(el, mainEl) {
  let outer = null;
  for (let box = el.parentElement; box && box !== mainEl && box !== document.body; box = box.parentElement) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy !== "auto" && oy !== "scroll") || box.scrollHeight <= box.clientHeight) continue;
    outer = box;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + 8) box.scrollBy({ top: r.top - b.top - 8, behavior: "smooth" });
    else if (r.bottom > b.bottom - 8) box.scrollBy({ top: r.bottom - b.bottom + 8, behavior: "smooth" });
  }
  return outer;
}

function scrollMainToShow(el) {
  const mainEl = document.querySelector(".tv-main");
  const navbar = document.querySelector(".tv-navbar");
  if (navbar?.contains(el)) return;
  const box = scrollInnerToShow(el, mainEl);
  if (!mainEl || !mainEl.contains(el)) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
  const mainRect = mainEl.getBoundingClientRect();
  let top = mainRect.top;
  if (navbar) top = Math.max(top, navbar.getBoundingClientRect().bottom);
  const sticky = mainEl.querySelector("[data-settings-header]");
  if (sticky) top = Math.max(top, sticky.getBoundingClientRect().bottom);
  top += 12;
  const bottom = mainRect.bottom - 16;
  const r = (box || el).getBoundingClientRect();
  const block = el.closest(NAV_BLOCKS);
  const br = block && mainEl.contains(block) ? block.getBoundingClientRect() : null;
  const cur = mainEl.scrollTop;
  let target = cur;
  if (cur + r.bottom <= bottom) target = 0;                       // fits on the first screen
  else if (br && br.height <= bottom - top) target = cur + br.top - top;
  else if (r.top < top) target = cur + r.top - top;
  else if (r.bottom > bottom) target = cur + r.bottom - bottom;
  target = Math.max(0, Math.min(Math.round(target), mainEl.scrollHeight - mainEl.clientHeight));
  if (Math.abs(target - cur) > 1) mainEl.scrollTo({ top: target, behavior: "smooth" });
}

// Scroll a horizontal row (cards, season tabs…) so the focused element sits fully
// inside it — including its focus scale (1.06) and ring — with a gap from the
// screen edge. The browser's own focus scroll stops with the card touching the
// edge, which clipped the last card of every row.
function scrollRowToShow(el) {
  let row = el.parentElement;
  while (row && row !== document.body) {
    const ox = getComputedStyle(row).overflowX;
    if ((ox === "auto" || ox === "scroll") && row.scrollWidth > row.clientWidth) break;
    row = row.parentElement;
  }
  if (!row || row === document.body) return;
  const r = el.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const grow = r.width * 0.03 + 8;
  const edge = Math.max(24, window.innerWidth * 0.025);
  const right = Math.min(rr.right, window.innerWidth) - edge;
  const left = Math.max(rr.left, 0) + grow;
  if (r.right + grow > right) row.scrollBy({ left: r.right + grow - right, behavior: "smooth" });
  else if (r.left < left) row.scrollBy({ left: r.left - left, behavior: "smooth" });
}

// Rows run to the screen's right edge: each row's right margin is pulled out to
// .tv-main's edge and the same space added as padding, so the last card can
// still scroll fully into view. Measured (not CSS) because rows sit in
// containers with different side padding (sections, library, detail pages).
const BLEED_ROWS = ".cards-row, .season-tabs";
function applyRowBleed() {
  const main = document.querySelector(".tv-main");
  if (!main) return;
  const edge = main.getBoundingClientRect().right;
  main.querySelectorAll(BLEED_ROWS).forEach((row) => {
    const old = Number(row.dataset.bleed || 0);
    if (row.dataset.bleedPad == null) {
      row.dataset.bleedPad = parseFloat(getComputedStyle(row).paddingRight) || 0;
    }
    const gap = Math.max(0, Math.round(edge - (row.getBoundingClientRect().right - old)));
    if (gap === old) return;
    row.dataset.bleed = gap;
    row.style.marginRight = gap ? `-${gap}px` : "";
    row.style.paddingRight = gap ? `${Number(row.dataset.bleedPad) + gap}px` : "";
  });
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

// The navbar is fixed on top while the page scrolls UNDER it, so it can't share
// one geometric row list with the page: a row hidden behind it sorted above it,
// and Up went card row → navbar → hidden row (skipping the visible one). The
// navbar is its own zone: Up from the page's top row enters it, Down from it
// lands on the first row visible below it.
function getNextFocus(activeEl, direction) {
  const elements = getFocusableElements();
  if (!elements.length) return null;
  if (!elements.includes(activeEl)) return elements[0];

  const navbar = document.querySelector(".tv-navbar");
  const navEls = navbar ? elements.filter((el) => navbar.contains(el)) : [];
  const pageEls = elements.filter((el) => !navEls.includes(el));
  const inNav = navEls.includes(activeEl);
  if (inNav && direction === "up") return null;
  if (inNav && direction === "down") {
    if (!pageEls.length) return null;
    const navBottom = navbar.getBoundingClientRect().bottom;
    const pageRows = buildRows(pageEls);
    const ax = activeEl.getBoundingClientRect();
    const firstVisible = pageRows.find((row) =>
      row.items.some((i) => i.el.getBoundingClientRect().bottom > navBottom + 4)) || pageRows[0];
    return closestCx(firstVisible.items, ax.left + ax.width / 2).el;
  }

  const rows = buildRows(inNav ? navEls : pageEls);
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
      if (rowIdx > 0) return closestCx(rows[rowIdx - 1].items, activeItem.cx).el;
      return navEls.length ? closestCx(buildRows(navEls)[0].items, activeItem.cx).el : null;
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
      if (direction === "up" && navbar && navbar.contains(next) && !navbar.contains(active)) {
        const activeBtn = navbar.querySelector("[data-nav-active='true']");
        (activeBtn || next).focus({ preventScroll: true });
      } else {
        next.focus({ preventScroll: true });
      }
      scrollRowToShow(next);
      scrollMainToShow(next);
    } else if (direction === "up") {
      const mainEl = document.querySelector(".tv-main");
      if (mainEl && mainEl.scrollTop > 0) {
        mainEl.scrollTo({ top: 0, behavior: "smooth" });
        const inNav = document.querySelector(".tv-navbar")?.contains(active);
        if (!inNav) setTimeout(() => getFocusableElements()[0]?.focus({ preventScroll: true }), 300);
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

  // Keep rows bled to the screen edge as pages render and the window resizes.
  useEffect(() => {
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyRowBleed(); }); };
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

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
