#!/usr/bin/env node
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "Rushikesh-Nivalkar/Rush-Flix";
const APK = resolve(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const m = env.match(/^GITHUB_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

const token = getToken();
if (!token) {
  console.error("GITHUB_TOKEN not found.\nAdd to .env.local:\n  GITHUB_TOKEN=ghp_...");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const tag = `v${version}`;

console.log(`Building APK ${tag}…`);
execSync("npm run build-apk", { cwd: ROOT, stdio: "inherit" });

console.log(`Creating release ${tag}…`);
const createRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "rush-flix-release",
  },
  body: JSON.stringify({
    tag_name: tag,
    name: `Rush Flix ${version}`,
    body: `Rush Flix ${version}`,
    draft: false,
    prerelease: false,
  }),
});

if (!createRes.ok) {
  const err = await createRes.json();
  if (err.errors?.[0]?.code === "already_exists") {
    console.error(`Release ${tag} already exists — bump version in package.json first.`);
  } else {
    console.error("Failed to create release:", JSON.stringify(err, null, 2));
  }
  process.exit(1);
}

const release = await createRes.json();
const uploadUrl = release.upload_url.replace("{?name,label}", "");

console.log("Uploading APK…");
const apkBuffer = readFileSync(APK);
const uploadRes = await fetch(`${uploadUrl}?name=rush-flix-${version}.apk`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/vnd.android.package-archive",
    "User-Agent": "rush-flix-release",
    "Content-Length": String(apkBuffer.length),
  },
  body: apkBuffer,
});

if (!uploadRes.ok) {
  const err = await uploadRes.json();
  console.error("Failed to upload APK:", JSON.stringify(err, null, 2));
  process.exit(1);
}

console.log(`Done: ${release.html_url}`);
