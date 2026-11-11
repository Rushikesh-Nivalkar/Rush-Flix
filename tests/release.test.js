// Every place the version lives must agree, or the in-app updater misbehaves.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { APP_VERSION, isNewerVersion } from "../src/utils/updateChecker";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

describe("release version", () => {
  it("matches across package.json, lock, appinfo, gradle and updater fallback", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
    expect(JSON.parse(read("appinfo.json")).version).toBe(pkg.version);
    expect(read("android/app/build.gradle")).toContain(`versionName "${pkg.version}"`);
    expect(read("src/utils/updateChecker.js")).toContain(`: "${pkg.version}";`);
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("versionCode is a positive whole number", () => {
    const m = read("android/app/build.gradle").match(/versionCode (\d+)/);
    expect(Number(m[1])).toBeGreaterThan(0);
  });
});

describe("isNewerVersion", () => {
  it.each([
    ["2.10.0", "2.9.0", true],
    ["2.9.1", "2.9.0", true],
    ["3.0.0", "2.99.99", true],
    ["v2.9.0", "2.9.0", false],
    ["2.8.9", "2.9.0", false],
    ["garbage", "2.9.0", false],
    ["2.9", "2.9.0", false],
  ])("%s newer than %s → %s", (a, b, want) => {
    expect(isNewerVersion(a, b)).toBe(want);
  });
});
