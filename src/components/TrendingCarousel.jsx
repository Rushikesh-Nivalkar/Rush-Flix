import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { imgUrl, isAnimeContent } from "../utils/api";
import { StarIcon } from "./Icons";

const VISIBLE = 5;
const HALF = Math.floor(VISIBLE / 2);

// ── Sub-components ────────────────────────────────────────────────────────────

const RatingBadge = memo(function RatingBadge({ cert, restricted }) {
  if (!cert) return null;
  return (
    <span
      className={`carousel-rating-badge${restricted ? " carousel-rating-badge--restricted" : ""}`}
      title={restricted ? "Age-restricted" : `Rated ${cert}`}
    >
      {cert}
    </span>
  );
});

const CarouselSlot = memo(function CarouselSlot({
  item,
  offset,
  onSelect,
  onFocus,
  animating,
  ageRating,
  restricted,
  isAnime,
}) {
  const rawDate = item ? (item.release_date || item.first_air_date) : null;

  const isUnreleased = useMemo(() => {
    if (!rawDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(rawDate) > today;
  }, [rawDate]);

  const releaseLabel = useMemo(
    () =>
      rawDate
        ? new Date(rawDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
    [rawDate],
  );

  if (!item) return null;
  const isCenter = offset === 0;
  const abs = Math.abs(offset);
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = imgUrl(item.poster_path, "w342");

  const scale = isCenter ? 1 : abs === 1 ? 0.75 : 0.54;
  const opacity = isCenter ? 1 : abs === 1 ? 0.65 : 0.35;
  const tx = offset * 230;

  return (
    <div
      className={`carousel-item${isCenter ? " carousel-item--active" : ""}${animating ? " carousel-item--animating" : ""}`}
      style={{
        transform: `translateX(${tx}px) scale(${scale})`,
        opacity,
        zIndex: isCenter ? 10 : abs === 1 ? 6 : 2,
        cursor: "pointer",
        pointerEvents: "auto",
      }}
      onClick={isCenter ? onSelect : onFocus}
    >
      <div className="carousel-poster-wrap">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="carousel-poster"
            draggable={false}
            loading={abs > 1 ? "lazy" : "eager"}
          />
        ) : (
          <div className="carousel-poster carousel-poster--placeholder">
            <span>{title}</span>
          </div>
        )}

        {isUnreleased && (
          <div className="carousel-unreleased-overlay">
            <span className="carousel-unreleased-label">🔒 Coming Soon</span>
            {releaseLabel && (
              <span className="carousel-unreleased-date">{releaseLabel}</span>
            )}
          </div>
        )}

        {isCenter && item.vote_average > 0 && (
          <div className="carousel-score">
            <StarIcon size={10} />
            {item.vote_average.toFixed(1)}
          </div>
        )}
        {isCenter && (
          <div className="carousel-badge-wrap">
            <RatingBadge cert={ageRating} restricted={restricted} />
          </div>
        )}
        {isCenter && isAnime && (
          <div className="carousel-anime-badge">ANIME</div>
        )}
      </div>

      {isCenter && (
        <div className="carousel-info">
          <div className="carousel-info__title">{title}</div>
          <div className="carousel-info__meta">
            {year && <span>{year}</span>}
            {item.media_type && (
              <span className="carousel-info__type">
                {item.media_type === "tv" ? "Series" : "Movie"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export default function TrendingCarousel({
  items,
  onSelect,
  title,
  titleHighlight,
  ratingsMap = {},
}) {
  const count = items.length;
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [animating, setAnimating] = useState(false);

  const wheelThrottle = useRef(false);
  const touchStartX = useRef(null);
  const containerRef = useRef(null);
  const animTimeout = useRef(null);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const go = useCallback(
    (idx) => {
      const next = ((idx % count) + count) % count;
      const curr = activeRef.current;
      if (next === curr) return;
      const fwd = (next - curr + count) % count;
      setDirection(fwd <= count / 2 ? 1 : -1);
      setAnimating(true);
      clearTimeout(animTimeout.current);
      animTimeout.current = setTimeout(() => setAnimating(false), 420);
      activeRef.current = next;
      setActive(next);
    },
    [count],
  );

  const goNext = useCallback(() => go(activeRef.current + 1), [go]);
  const goPrev = useCallback(() => go(activeRef.current - 1), [go]);

  // ── Wheel ──────────────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e) => {
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!isHorizontal) return;
      e.preventDefault();
      if (wheelThrottle.current) return;
      wheelThrottle.current = true;
      setTimeout(() => { wheelThrottle.current = false; }, 600);
      e.deltaX > 0 ? goNext() : goPrev();
    },
    [goNext, goPrev],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── D-pad / keyboard navigation ────────────────────────────────────────────
  // Native addEventListener so stopPropagation prevents tvNav's window listener
  // from also consuming ArrowLeft/Right. ArrowUp/Down bubble up to tvNav.

  const goPrevRef = useRef(goPrev);
  const goNextRef = useRef(goNext);
  const onSelectRef = useRef(onSelect);
  const itemsRef = useRef(items);
  useEffect(() => { goPrevRef.current = goPrev; }, [goPrev]);
  useEffect(() => { goNextRef.current = goNext; }, [goNext]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowLeft":
          e.stopPropagation();
          e.preventDefault();
          goPrevRef.current();
          break;
        case "ArrowRight":
          e.stopPropagation();
          e.preventDefault();
          goNextRef.current();
          break;
        case "Enter":
          e.stopPropagation();
          e.preventDefault();
          { const item = itemsRef.current[activeRef.current]; if (item) onSelectRef.current(item); }
          break;
        default:
          break;
      }
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch ──────────────────────────────────────────────────────────────────

  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const onTouchEnd = useCallback(
    (e) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 40) return;
      dx < 0 ? goNext() : goPrev();
    },
    [goNext, goPrev],
  );

  // ── Slot & rating data ─────────────────────────────────────────────────────

  const slots = useMemo(
    () =>
      Array.from({ length: VISIBLE }, (_, i) => {
        const offset = i - HALF;
        const idx = (((active + offset) % count) + count) % count;
        return { offset, idx };
      }),
    [active, count],
  );

  const slotHandlers = useMemo(() => {
    const handlers = {};
    for (let i = 0; i < VISIBLE; i++) {
      const offset = i - HALF;
      const idx = (((active + offset) % count) + count) % count;
      if (offset === 0) {
        handlers[offset] = {
          onSelect: () => onSelect(items[idx]),
          onFocus: null,
        };
      } else {
        const captured = idx;
        handlers[offset] = {
          onSelect: null,
          onFocus: () => go(captured),
        };
      }
    }
    return handlers;
  }, [active, count, items, onSelect, go]);

  const activeItem = items[active];
  const activeType = activeItem?.media_type === "tv" ? "tv" : "movie";
  const activeRatingKey = activeItem ? `${activeType}_${activeItem.id}` : null;
  const activeRating = activeRatingKey ? ratingsMap[activeRatingKey] || {} : {};

  if (!items || count === 0) return null;

  return (
    <div className="carousel-section">
      <div className="section-title">
        {titleHighlight ? (
          <>
            {title}&nbsp;
            <span style={{ color: "var(--red)" }}>{titleHighlight}</span>
          </>
        ) : (
          title
        )}
      </div>

      <div
        className="carousel-wrapper"
        ref={containerRef}
        tabIndex={0}
        data-focusable
        aria-label={`${title} carousel — use left/right to browse, Enter to open`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`carousel-track${animating ? ` carousel-track--dir-${direction > 0 ? "fwd" : "bwd"}` : ""}`}
        >
          {slots.map(({ offset, idx }) => {
            const isCenter = offset === 0;
            const ratingData = isCenter ? activeRating : {};
            const h = slotHandlers[offset];
            return (
              <CarouselSlot
                key={offset}
                item={items[idx]}
                offset={offset}
                onSelect={h.onSelect}
                onFocus={h.onFocus}
                animating={animating}
                ageRating={isCenter ? ratingData.cert : null}
                restricted={isCenter ? ratingData.restricted : false}
                isAnime={isCenter ? isAnimeContent(items[idx]) : false}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
