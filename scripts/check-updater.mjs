// Pre-release check: does the in-app update check really find the release?
//
// Bundles src/utils/updateChecker.js, serves it from http://127.0.0.1 and runs
// checkForUpdates() in headless Chrome/Edge — a cross-origin page, exactly like
// the app WebView — so a CORS-blocked URL fails here instead of on users' TVs
// (that is how v2.5.0–v2.7.0 shipped a dead "Check for updates" button).
// In a browser Capacitor is not native, so this exercises the fetch() path used
// by webOS and the browser; the Android native path has no CORS to fail on.
//
// Usage: npm run check:updater [-- vX.Y.Z]   (default: v<package.json version>)
// Run after publishing a release to confirm it is discoverable. Exit 0 = pass.

import { build } from "vite";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const expected = process.argv[2] || `v${pkg.version}`;

const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find((p) => existsSync(p));
if (!browser) fail("No Chrome or Edge found.");

function fail(msg) {
  console.error(`✕ check:updater FAILED — ${msg}`);
  process.exit(1);
}

// 1. Bundle the real update checker (APP_VERSION 0.0.0 so any release counts as newer).
const out = await build({
  root,
  configFile: false,
  logLevel: "silent",
  define: { __APP_VERSION__: JSON.stringify("0.0.0") },
  build: {
    write: false,
    minify: false,
    lib: { entry: join(root, "src/utils/updateChecker.js"), formats: ["iife"], name: "RFUpdater" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const code = (Array.isArray(out) ? out[0] : out).output[0].code;

// 2. Serve it from a local origin (≠ api.github.com → real CORS rules apply).
const html = `<!doctype html><script>${code}</script>`;
const server = createServer((_, res) => { res.setHeader("Content-Type", "text/html"); res.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

// 3. Run checkForUpdates() in headless Chrome via the DevTools protocol.
const profile = mkdtempSync(join(tmpdir(), "rf-updater-"));
const port = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(browser, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, pageUrl,
]);
const cleanup = () => { try { chrome.kill(); } catch {} server.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };

let result;
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page" && t.url.startsWith(pageUrl));
    } catch {}
  }
  if (!target) throw new Error("headless browser did not start");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let msgId = 0;
  const evaluate = () => new Promise((resolve) => {
    const id = ++msgId;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === id) resolve(m.error ? { protocolError: m.error } : m.result);
    };
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: {
        awaitPromise: true,
        returnByValue: true,
        // Wait for the page's script to load before calling it.
        expression: `new Promise((ready) => { const t0 = Date.now(); (function wait() {
            if (typeof RFUpdater !== "undefined" || Date.now() - t0 > 10000) ready(); else setTimeout(wait, 100);
          })(); })
          .then(() => RFUpdater.checkForUpdates())
          .then(r => ({ ok: true, r }), e => ({ ok: false, error: e.message }))`,
      },
    }));
  });
  // The page may still be navigating when we first connect ("Execution context
  // was destroyed") — retry instead of reporting a false failure.
  let reply;
  for (let attempt = 0; attempt < 5; attempt++) {
    reply = await evaluate();
    if (!/context/i.test(reply?.protocolError?.message || "")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  ws.close();
  if (reply?.exceptionDetails)
    throw new Error(`browser error: ${reply.exceptionDetails.exception?.description || reply.exceptionDetails.text}`);
  result = reply?.result?.value;
  if (!result) throw new Error(`unexpected browser reply: ${String(JSON.stringify(reply ?? null)).slice(0, 300)}`);
} catch (e) {
  cleanup();
  fail(e.message);
}
cleanup();

// 4. Verdict.
if (!result) fail("no result from the browser.");
if (!result.ok) fail(`update check threw: "${result.error}"`);
const { latest, apkUrl, ipkUrl } = result.r;
console.log(`  latest release seen in-app: ${latest}`);
console.log(`  apkUrl: ${apkUrl}`);
console.log(`  ipkUrl: ${ipkUrl}`);
if (latest !== expected) fail(`expected ${expected}, the app sees ${latest}.`);
if (!apkUrl) fail(`release ${latest} has no Rush-Flix_V${latest.slice(1)}.apk asset.`);
if (!ipkUrl) fail(`release ${latest} has no Rush-Flix_V${latest.slice(1)}.ipk asset.`);
console.log(`✓ check:updater passed — the in-app update check finds ${expected} with APK + IPK.`);
process.exit(0);
