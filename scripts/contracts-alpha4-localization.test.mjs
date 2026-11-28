import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const docsSiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractsRoot = "locales/zh-CN/aethercontracts";

function read(relativePath) {
  return readFileSync(
    path.join(docsSiteRoot, contractsRoot, relativePath),
    "utf8",
  );
}

const releaseStatusPages = [
  "getting-started.md",
  "compatibility.md",
  "MIGRATION.md",
  "SECURITY.md",
];

const specPages = [
  "spec/foundation.md",
  "spec/cloudlink-v1alpha1.md",
  "spec/distribution-v1alpha1.md",
  "spec/tck-v1alpha1.md",
  "spec/thing-model-v1alpha1.md",
  "spec/integration-v1alpha1.md",
  "spec/integration-control-v1alpha1.md",
];

const translatedPages = [
  "index.md",
  "conformance.md",
  "integration.md",
  "GOVERNANCE.md",
  "migrations/alpha3-to-alpha4.md",
  "packages/c.md",
  "packages/cpp.md",
  "packages/rust.md",
  "packages/typescript.md",
  ...releaseStatusPages,
  ...specPages,
];

describe("AetherContracts Chinese release status", () => {
  it("separates the published alpha.4 release from the alpha.5 development target", () => {
    for (const page of releaseStatusPages) {
      const content = read(page);
      expect(content, page).toContain("最新发布版本是 `v0.1.0-alpha.4`");
      expect(content, page).toMatch(/alpha\.5/);
      expect(content, page).toContain("尚未发布");
    }

    const migration = read("migrations/alpha3-to-alpha4.md");
    expect(migration).toContain("最新发布版本：`v0.1.0-alpha.4`");
    expect(migration).toContain("开发目标：`0.1.0-alpha.5`");

    expect(read("MIGRATION.md")).toContain("v0.1.0-alpha.3` 已经不可变");
    for (const page of specPages) {
      expect(read(page), page).toContain("\nversion: 0.1.0-alpha.4\n");
    }

    const pages = translatedPages.map(read).join("\n");
    expect(pages).not.toMatch(
      /(?:最新发布版本|当前发布版本|当前版本)(?:仍)?是 `?v?0\.1\.0-alpha\.3/,
    );
    expect(pages).not.toMatch(/alpha\.4`? ?(?:只是|仍是|是)?尚未发布/);
    expect(pages).not.toMatch(/alpha\.4 开发目标/);
  });

  it("keeps the English tagged contract authoritative and the release experimental", () => {
    for (const page of translatedPages) {
      expect(read(page), page).toContain("英文规范");
    }

    const pages = translatedPages.map(read).join("\n");
    expect(pages).toContain("处于实验阶段");
    expect(pages).toContain("不是生产");
    expect(pages).toContain("默认关闭");
  });

  it("preserves the Integration and Integration Control safety boundary", () => {
    const integration = read("spec/integration-v1alpha1.md");
    const control = read("spec/integration-control-v1alpha1.md");

    expect(integration).toContain("只读");
    expect(integration).toContain("提供方凭据");
    expect(control).toContain("device.power.set.v1");
    expect(control).toContain("提供方接受");
    expect(control).toContain("不能证明无线报文已到达设备");
    expect(control).toContain("不得把 `provider-accepted` 变成物理完成");
  });
});
