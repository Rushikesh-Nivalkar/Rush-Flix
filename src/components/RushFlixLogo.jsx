import { motion, useReducedMotion } from "motion/react";

const SIZES = {
  sm: { icon: 28, font: 15, gap: 8,  dot: 6  },
  md: { icon: 44, font: 22, gap: 12, dot: 9  },
  lg: { icon: 60, font: 30, gap: 16, dot: 12 },
};

// Geometric RF monogram — pure SVG paths, no embedded images
function RFMark({ size }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <rect width="200" height="200" fill="#0A0A0A" rx="20" />
      {/* R */}
      <rect x="28" y="36" width="14" height="128" fill="#E50914" />
      <rect x="28" y="36" width="56" height="14"  fill="#E50914" />
      <rect x="70" y="36" width="14" height="52"  fill="#E50914" />
      <rect x="28" y="74" width="56" height="14"  fill="#E50914" />
      <polygon points="70,88 84,88 102,164 88,164" fill="#E50914" />
      {/* F */}
      <rect x="112" y="36" width="14" height="128" fill="#E50914" />
      <rect x="112" y="36" width="58" height="14"  fill="#E50914" />
      <rect x="112" y="74" width="46" height="14"  fill="#E50914" />
      {/* Scan line */}
      <rect x="18" y="108" width="164" height="2" fill="#E50914" opacity="0.28" />
    </svg>
  );
}

export default function RushFlixLogo({ size = "md", animate = true }) {
  const prefersReduced = useReducedMotion();
  const storageReduced = typeof localStorage !== "undefined"
    && localStorage.getItem("rushflix_reduceAnimations") === "true";
  const skip = !animate || prefersReduced || storageReduced;

  const { icon, font, gap, dot } = SIZES[size] || SIZES.md;

  const ease = [0.16, 1, 0.3, 1];

  const iconMotion = skip ? {} : {
    initial: { opacity: 0, scale: 0.82 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.35, ease },
  };

  const rushMotion = skip ? {} : {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.12, duration: 0.3, ease },
  };

  const dotMotion = skip ? {} : {
    initial: { opacity: 0, scale: 0.4 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay: 0.28, duration: 0.2, ease },
  };

  const flixMotion = skip ? {} : {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.22, duration: 0.3, ease },
  };

  const wordStyle = {
    fontSize: font,
    fontWeight: 900,
    letterSpacing: "0.13em",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, sans-serif",
    lineHeight: 1,
    display: "inline-block",
  };

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap, userSelect: "none" }}
      aria-label="Rush Flix"
    >
      <motion.div {...iconMotion}>
        <RFMark size={icon} />
      </motion.div>

      <div style={{ display: "flex", alignItems: "baseline" }}>
        <motion.span style={wordStyle} {...rushMotion}>
          RUSH
        </motion.span>

        <motion.span
          style={{
            fontSize: font,
            fontWeight: 900,
            color: "#E50914",
            margin: `0 ${dot}px`,
            lineHeight: 1,
            display: "inline-block",
          }}
          {...dotMotion}
        >
          ·
        </motion.span>

        <motion.span style={wordStyle} {...flixMotion}>
          FLIX
        </motion.span>
      </div>
    </div>
  );
}
