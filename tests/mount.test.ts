import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mountPath = fileURLToPath(new URL("../src/mount.ts", import.meta.url));
const appPath = fileURLToPath(new URL("../src/app.ts", import.meta.url));
const demoPath = fileURLToPath(new URL("../src/demo.ts", import.meta.url));

describe("mount sample option", () => {
  it("threads sample through mount into startProximity", () => {
    const mount = readFileSync(mountPath, "utf-8");
    const app = readFileSync(appPath, "utf-8");

    expect(mount).toContain("sample?: boolean");
    expect(mount).toContain("startProximity(root, options)");
    expect(app).toContain("options.sample");
    expect(app).toContain("loadSample(false)");
  });

  it("threads share through mount into startProximity", () => {
    const mount = readFileSync(mountPath, "utf-8");
    const app = readFileSync(appPath, "utf-8");

    expect(mount).toContain("share?: boolean");
    expect(mount).toContain("startProximity(root, options)");
    expect(app).toContain("options.share");
  });

  it("threads cartoApiKey through mount into startProximity", () => {
    const mount = readFileSync(mountPath, "utf-8");
    const app = readFileSync(appPath, "utf-8");

    expect(mount).toContain("cartoApiKey?: string");
    expect(mount).toContain("startProximity(root, options)");
    expect(app).toContain("options.cartoApiKey");
  });

  it("loads the sample on the standalone demo", () => {
    const demo = readFileSync(demoPath, "utf-8");
    expect(demo).toContain("sample: true");
  });
});
