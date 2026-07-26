import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edgeRoot = path.resolve(
  process.env.AETHER_EDGE_DOCS_ROOT ?? path.join(docsRoot, '..', 'AetherEdge')
);

function readDocs(relativePath) {
  return readFileSync(path.join(docsRoot, relativePath), 'utf8');
}

function readEdge(relativePath) {
  return readFileSync(path.join(edgeRoot, relativePath), 'utf8');
}

describe('AetherIoT product-family documentation', () => {
  it('defines one umbrella project and three core products', () => {
    const overview = readEdge('docs/overview/platform.md');

    expect(overview).toContain('AetherIoT is the open-source, AI-native project identity');
    expect(overview).toContain('AetherEdge       deterministic edge runtime');
    expect(overview).toContain('AetherCloud      evolving agent, fusion');
    expect(overview).toContain('AetherContracts  typed specifications');
    expect(overview).toContain('AetherEMS            energy-management solution');
    expect(overview).toContain('[AI-native platform](ai-native-platform.md)');
  });

  it('pins a tested compatibility baseline without claiming production CloudLink', () => {
    const matrix = readEdge('docs/compatibility/version-matrix.md');

    expect(matrix).toContain('`v0.0.1`');
    expect(matrix).toContain('`v0.1.0-alpha.3`');
    expect(matrix).toContain('Experimental integration baseline');
    expect(matrix).toContain('It is not production');
  });

  it('renames repository-facing identity while preserving software and protocol names', () => {
    const migration = readEdge('docs/migration/aetheriot-to-aetheredge.md');

    expect(migration).toContain('https://github.com/EvanL1/AetherEdge');
    expect(migration).toContain('The `aether` CLI and `aether-*` binaries');
    expect(migration).toContain('CloudLink, Thing Model, Schema, TCK');
    expect(migration).toContain('Never rewrite published artifacts');
  });

  it('publishes detailed Cloud and Contracts source collections', () => {
    const sources = JSON.parse(readDocs('content.sources.json'));
    expect(sources.sources.map(({ id }) => id)).toEqual([
      'aetheredge',
      'aethercloud',
      'aethercontracts',
      'site-en',
      'site-zh-cn',
    ]);

    const edgeSource = sources.sources.find(({ id }) => id === 'aetheredge');
    expect(edgeSource).toMatchObject({
      root: '../AetherEdge',
      rootEnv: 'AETHER_EDGE_DOCS_ROOT',
      manifest: 'ai/public-docs.manifest.txt',
      manifestBase: 'source',
    });

    const cloudManifest = readDocs('content.aethercloud.manifest.txt');
    expect(cloudManifest).toContain('docs/get-started/*');
    expect(cloudManifest).toContain('docs/concepts/!(current-state-audit).md');
    expect(cloudManifest).not.toContain('\ndocs/concepts/*\n');
    expect(cloudManifest).toContain('docs/guides/*');
    expect(cloudManifest).toContain('docs/recovery/*');
    expect(cloudManifest).toContain('docs/reference/*');

    const contractsManifest = readDocs('content.aethercontracts.manifest.txt');
    expect(contractsManifest).toContain('docs/getting-started.md');
    expect(contractsManifest).toContain('docs/compatibility.md');
    expect(contractsManifest).toContain('docs/conformance.md');
    expect(contractsManifest).toContain('docs/integration.md');
    expect(contractsManifest).toContain('docs/migrations/*');
    expect(contractsManifest).toContain('SECURITY.md');
    expect(contractsManifest).toContain('GOVERNANCE.md');
    expect(contractsManifest).toContain('spec/*');
    expect(contractsManifest).toContain('packages/*/README.md');
  });

  it('gives both products detailed generated sidebars', () => {
    const config = readDocs('astro.config.mjs');

    expect(config).toContain("directory: 'aethercloud/concepts'");
    expect(config).toContain("directory: 'aethercloud/guides'");
    expect(config).toContain("directory: 'aethercloud/recovery'");
    expect(config).toContain("directory: 'aethercloud/reference'");
    expect(config).toContain("directory: 'aethercontracts/spec'");
    expect(config).toContain("directory: 'aethercontracts/packages'");
    expect(config).toContain("directory: 'aethercontracts/migrations'");
    expect(config).toContain("directory: 'recovery'");
  });

  it('disambiguates concept pages from crate reference pages in agent indexes', () => {
    expect(readEdge('docs/concepts/data-processing.md')).toContain(
      'title: Aether Data Processing'
    );
    expect(readEdge('crates/aether-data-processing/README.md')).toMatch(
      /^# aether-data-processing crate$/m
    );
    expect(readDocs('locales/zh-CN/crates/aether-data-processing.md')).toContain(
      'title: "aether-data-processing 组件库"'
    );
  });

  it('keeps the cross-product integration guide inside Guides without a Tutorials section', () => {
    const config = readDocs('astro.config.mjs');
    const edgeManifest = readEdge('ai/public-docs.manifest.txt');
    const chineseManifest = readDocs('content.zh-cn.manifest.txt');

    expect(config).not.toContain("label: 'Tutorials'");
    expect(config).toContain(
      "'/tutorials/edge-contracts-cloud': '/guides/edge-contracts-cloud'"
    );
    expect(config).toContain(
      "'/zh/tutorials/edge-contracts-cloud': '/zh/guides/edge-contracts-cloud'"
    );
    expect(edgeManifest).toContain('docs/guides/*');
    expect(edgeManifest).not.toContain('docs/tutorials/*');
    expect(chineseManifest).toContain('locales/zh-CN/guides/edge-contracts-cloud.md');
    expect(chineseManifest).not.toContain(
      'locales/zh-CN/tutorials/edge-contracts-cloud.md'
    );
  });

  it('makes pagination direction labels primary and keeps page names compact', () => {
    const config = readDocs('astro.config.mjs');
    const styles = readDocs('src/styles/custom.css');

    expect(config).toContain("customCss: ['./src/styles/custom.css']");
    expect(styles).toMatch(/\.pagination-links a > span[\s\S]*font-size:\s*1\.125rem/);
    expect(styles).toMatch(/\.pagination-links \.link-title[\s\S]*font-size:\s*0\.8125rem/);
    expect(styles).toContain('text-wrap: balance');
    expect(styles).not.toContain('var(--sl-text-2xl)');
  });
});
