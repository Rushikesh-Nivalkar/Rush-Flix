/**
 * Generates android/app/src/main/res/drawable-xhdpi/tv_banner.png
 * 640×360px — required PNG format for Android TV Leanback launcher.
 * Pure Node.js, no external deps (uses built-in zlib).
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 640, H = 360;
const RED = [229, 9, 20];
const BG = [10, 10, 10];

const buf = Buffer.alloc(W * H * 3);
for (let i = 0; i < buf.length; i += 3) {
  buf[i] = BG[0]; buf[i+1] = BG[1]; buf[i+2] = BG[2];
}

function px(x, y, col) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = col[0]; buf[i+1] = col[1]; buf[i+2] = col[2];
}

function rect(x, y, w, h, col) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      px(x + dx, y + dy, col);
}

// Scale factor: banner viewport is 320×180, output is 640×360
const sc = 2;
function sr(x, y, w, h, col) { rect(x*sc, y*sc, w*sc, h*sc, col || RED); }

// Left red accent bar
rect(0, 0, 8, H, RED);

// ── R letterform ──────────────────────────────────────────────────────────────
sr(99, 34, 13, 110); // vertical stem
sr(99, 34, 48, 13);  // top bar
sr(136, 34, 13, 45); // upper right vertical
sr(99, 68, 48, 13);  // middle bar

// Diagonal leg: polygon (136,81)→(147,81)→(163,146)→(152,146)
// At row y (in 320-space): left=136+16*t, right=147+16*t, width=11
for (let y = 81; y <= 146; y++) {
  const t = (y - 81) / (146 - 81);
  const lx = Math.round((136 + 16 * t) * sc);
  const rx = Math.round((147 + 16 * t) * sc);
  rect(lx, y * sc, rx - lx, sc, RED);
}

// ── F letterform ──────────────────────────────────────────────────────────────
sr(171, 34, 13, 110); // vertical stem
sr(171, 34, 50, 13);  // top bar
sr(171, 68, 40, 13);  // middle bar

// Scan line (28% opacity blended over background)
{
  const a = 0.28;
  const sc2 = [
    Math.round(RED[0]*a + BG[0]*(1-a)),
    Math.round(RED[1]*a + BG[1]*(1-a)),
    Math.round(RED[2]*a + BG[2]*(1-a)),
  ];
  sr(97, 100, 127, 1, sc2);
}

// ── Bitmap font (5×9) for "RUSH · FLIX" ──────────────────────────────────────
const GLYPHS = {
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  " ": ["000","000","000","000","000","000","000"],
  "·": ["0","0","0","1","0","0","0"],
};

function measureText(str, scale) {
  let w = 0;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    w += (g[0].length + 1) * scale;
  }
  return w - scale;
}

function drawText(str, sx, sy, scale, col) {
  let cx = sx;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) { cx += 4 * scale; continue; }
    const gw = g[0].length;
    for (let row = 0; row < g.length; row++) {
      for (let col2 = 0; col2 < gw; col2++) {
        if (g[row][col2] === "1") {
          rect(cx + col2 * scale, sy + row * scale, scale, scale, col);
        }
      }
    }
    cx += (gw + 1) * scale;
  }
}

const TS = 8; // text scale: each bitmap pixel → 8px, letters ~56px tall
const textY = H - 7 * TS - 28;
const GAP = TS * 2; // gap between words

const wRUSH = measureText("RUSH", TS);
const wDot  = measureText("·",    TS);
const wFLIX = measureText("FLIX", TS);
const totalW = wRUSH + GAP + wDot + GAP + wFLIX;
const textX = Math.round((W - totalW) / 2);

let cx = textX;
drawText("RUSH", cx, textY, TS, [255, 255, 255]); cx += wRUSH + GAP;
drawText("·",    cx, textY, TS, RED);              cx += wDot  + GAP;
drawText("FLIX", cx, textY, TS, [255, 255, 255]);

// ── PNG encoding ──────────────────────────────────────────────────────────────
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (const byte of b) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

// Build raw scanlines (filter byte 0 + RGB pixels per row)
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const idat = zlib.deflateSync(raw, { level: 9 });
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);

const outDir = path.resolve(__dirname, "../android/app/src/main/res/drawable-xhdpi");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "tv_banner.png");
fs.writeFileSync(outPath, png);
console.log(`✓ ${outPath}  (${W}×${H}px, ${(png.length / 1024).toFixed(1)} KB)`);
