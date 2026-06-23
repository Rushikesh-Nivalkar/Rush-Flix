/**
 * Creates a webOS IPK from dist/ without ares-package.
 * IPK = ar archive containing debian-binary, control.tar.gz, data.tar.gz
 * Uses Windows tar (bsdtar, available since Win10 1803) for the .tar.gz parts.
 */
const { execSync }  = require("child_process");
const {
  cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync,
} = require("fs");
const { join, resolve } = require("path");
const os = require("os");

const root    = process.cwd();
const dist    = join(root, "dist");
const pkg     = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appinfo = JSON.parse(readFileSync(join(root, "appinfo.json"), "utf8"));
const version = pkg.version;
const appId   = appinfo.id; // com.rushflix.app

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const tmp = join(os.tmpdir(), `rushflix-webos-${Date.now()}`);
const controlDir = join(tmp, "control-stage");
const dataDir    = join(tmp, "data-stage");

try {
  // ── 1. Stage control directory ────────────────────────────────────────────
  mkdirSync(controlDir, { recursive: true });
  const control = [
    `Package: ${appId}`,
    `Version: ${version}`,
    `Section: misc`,
    `Priority: optional`,
    `Architecture: all`,
    `Description: Rush Flix webOS TV app`,
    ``,
  ].join("\n");
  writeFileSync(join(controlDir, "control"), control);

  // ── 2. Stage data directory (webOS app path) ──────────────────────────────
  const appInstallDir = join(dataDir, "usr", "palm", "applications", appId);
  mkdirSync(appInstallDir, { recursive: true });
  cpSync(dist, appInstallDir, { recursive: true });
  // Write appinfo.json with current version into the staged app dir
  appinfo.version = version;
  writeFileSync(join(appInstallDir, "appinfo.json"), JSON.stringify(appinfo, null, 2));

  // ── 3. Create control.tar.gz and data.tar.gz ─────────────────────────────
  const controlTar = join(tmp, "control.tar.gz");
  const dataTar    = join(tmp, "data.tar.gz");

  // bsdtar (Windows built-in): -C changes into dir before adding files
  execSync(`tar -czf "${controlTar}" -C "${controlDir}" .`, { stdio: "inherit" });
  execSync(`tar -czf "${dataTar}" -C "${dataDir}" usr`, { stdio: "inherit" });

  // ── 4. Assemble the ar archive (IPK) ─────────────────────────────────────
  const debianBinary = Buffer.from("2.0\n");
  const controlData  = readFileSync(controlTar);
  const dataData     = readFileSync(dataTar);

  function arMember(name, data) {
    const header = Buffer.alloc(60);
    // Name (16), Timestamp (12), UID (6), GID (6), Mode (8), Size (10), Magic (2)
    header.write(name.padEnd(16),        0,  16, "ascii");
    header.write("0".padEnd(12),         16, 12, "ascii");
    header.write("0".padEnd(6),          28,  6, "ascii");
    header.write("0".padEnd(6),          34,  6, "ascii");
    header.write("100644".padEnd(8),     40,  8, "ascii");
    header.write(String(data.length).padEnd(10), 48, 10, "ascii");
    header.write("\x60\x0A",             58,  2, "ascii");
    const parts = [header, data];
    if (data.length % 2 !== 0) parts.push(Buffer.from("\n"));
    return Buffer.concat(parts);
  }

  const ipkPath = join(root, `Rush-Flix_V${version}.ipk`);
  writeFileSync(ipkPath, Buffer.concat([
    Buffer.from("!<arch>\n"),
    arMember("debian-binary", debianBinary),
    arMember("control.tar.gz", controlData),
    arMember("data.tar.gz", dataData),
  ]));

  const sizeKB = Math.round(readFileSync(ipkPath).length / 1024);
  console.log(`✓ webOS IPK: Rush-Flix_V${version}.ipk (${sizeKB} KB)`);

} finally {
  rmSync(tmp, { recursive: true, force: true });
}
