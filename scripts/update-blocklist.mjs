// Refresh the ad/tracker blocklist bundled into the Android app.
//
// Downloads HaGeZi "Pro" (https://github.com/hagezi/dns-blocklists, GPL-3.0),
// merges scripts/adblock-custom.txt, and writes
// android/app/src/main/assets/adblock/domains.txt (one domain per line; a
// domain also blocks all of its subdomains). The overlay player in
// MainActivity.java drops any request to a listed domain.
//
// Run before every release:  npm run update:blocklist

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro-onlydomains.txt";
const CUSTOM = join(root, "scripts", "adblock-custom.txt");
const OUT = join(root, "android", "app", "src", "main", "assets", "adblock", "domains.txt");

// Hosts the player needs — never blocked, even if a list ever includes them.
const NEVER = [
  "cineby.homes", "cloudorchestranova.com", "vsembed.ru", "vidsrc.sh", "vidapi.cloud",
  "themoviedb.org", "tmdb.org", "jsdelivr.net", "opensubtitles.org", "github.com",
  "githubusercontent.com", "iptv-org.github.io",
];

const clean = (text) => text.split(/\r?\n/)
  .map((l) => l.trim().toLowerCase().replace(/^\*\./, ""))
  .filter((l) => l && !l.startsWith("#") && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(l));

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`HaGeZi download failed: HTTP ${res.status}`);
const list = clean(await res.text());
if (list.length < 50000) throw new Error(`HaGeZi list looks wrong (${list.length} domains) — not writing`);
const custom = clean(readFileSync(CUSTOM, "utf8"));

const isNever = (d) => NEVER.some((n) => d === n || d.endsWith("." + n));
const all = [...new Set([...list, ...custom])].filter((d) => !isNever(d)).sort();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT,
  `# Rush Flix ad/tracker blocklist — generated ${new Date().toISOString().slice(0, 10)}\n` +
  `# Source: HaGeZi Pro (GPL-3.0) ${SOURCE} + scripts/adblock-custom.txt\n` +
  all.join("\n") + "\n");
console.log(`✓ blocklist: ${all.length} domains (HaGeZi ${list.length} + custom ${custom.length}) → ${OUT}`);
