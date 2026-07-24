import { describe, expect, it } from 'vitest';
import worker from './entry.js';

const files = new Map([
  ['/index.html', '<!doctype html><h1>Aether Documentation</h1>'],
  ['/agent-quickstart/index.html', '<!doctype html><h1>Agent Quickstart</h1>'],
  ['/index.md', '# Aether\n\nAether documentation.\n'],
  ['/agent-quickstart.md', '# Agent Quickstart\n'],
  ['/llms.txt', '# Aether Documentation\n\n## Overview\n'],
  ['/zh/index.html', '<!doctype html><h1>Aether 文档</h1>'],
  ['/zh/agent-quickstart/index.html', '<!doctype html><h1>智能体快速入门</h1>'],
  ['/zh.md', '# Aether\n\nAether 中文文档。\n'],
  ['/zh/agent-quickstart.md', '# 智能体快速入门\n'],
  ['/zh/llms.txt', '# Aether 文档\n\n## 概览\n'],
]);

function environment(options = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        if (options.throwOnFetch) throw new Error('asset binding unavailable');
        const url = new URL(request.url);
        let assetPath = url.pathname;
        if (assetPath === '/') assetPath = '/index.html';
        if (assetPath.endsWith('/')) assetPath += 'index.html';
        const content = files.get(assetPath);
        if (content === undefined) return new Response('missing', { status: 404 });
        const contentType = assetPath.endsWith('.html') ? 'text/html' : 'text/plain';
        return new Response(request.method === 'HEAD' ? null : content, {
          headers: { 'Content-Type': contentType },
        });
      },
    },
  };
}

function run(path, init, options) {
  return worker.fetch(new Request(`https://example.com${path}`, init), environment(options));
}

describe('dual-mode Worker in the Node unit-test runtime', () => {
  it.each([
    [
      '/tutorials/edge-contracts-cloud',
      'https://example.com/guides/edge-contracts-cloud/',
    ],
    [
      '/tutorials/edge-contracts-cloud/',
      'https://example.com/guides/edge-contracts-cloud/',
    ],
    [
      '/tutorials/edge-contracts-cloud.md',
      'https://example.com/guides/edge-contracts-cloud.md',
    ],
    [
      '/zh/tutorials/edge-contracts-cloud?source=old',
      'https://example.com/zh/guides/edge-contracts-cloud/?source=old',
    ],
  ])('permanently redirects the legacy guide route %s', async (path, location) => {
    const response = await run(path, {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    });

    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(location);
  });

  it.each([
    ['/en', 'https://example.com/'],
    ['/en/', 'https://example.com/'],
    ['/en.md', 'https://example.com/index.md'],
    ['/en/llms.txt', 'https://example.com/llms.txt'],
    ['/en/tutorials/edge-contracts-cloud', 'https://example.com/tutorials/edge-contracts-cloud'],
    ['/en/agent-quickstart/?ref=index', 'https://example.com/agent-quickstart/?ref=index'],
  ])('permanently strips the retired /en prefix from %s', async (path, location) => {
    const response = await run(path, { redirect: 'manual' });

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe(location);
  });

  it('does not treat /en-prefixed page names as the retired locale', async () => {
    const response = await run('/energy-pack', {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    });

    expect(response.status).toBe(404);
  });

  it('serves HTML by default and Markdown on explicit request', async () => {
    const html = await run('/agent-quickstart/');
    const markdown = await run('/agent-quickstart/', {
      headers: { Accept: 'text/markdown' },
    });

    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(await html.text()).toContain('<h1>Agent Quickstart</h1>');
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await markdown.text()).toContain('# Agent Quickstart');
  });

  it('serves Chinese HTML and Markdown under /zh', async () => {
    const html = await run('/zh/agent-quickstart/');
    const markdown = await run('/zh/agent-quickstart/', {
      headers: { Accept: 'text/markdown' },
    });

    expect(await html.text()).toContain('<h1>智能体快速入门</h1>');
    expect(await markdown.text()).toContain('# 智能体快速入门');
  });

  it('redirects the root to /zh/ only for Chinese-preferring HTML requests', async () => {
    const chinese = await run('/', {
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      redirect: 'manual',
    });
    const english = await run('/', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8' },
    });
    const unspecified = await run('/');
    const markdown = await run('/', {
      headers: { Accept: 'text/markdown', 'Accept-Language': 'zh-CN' },
    });
    const otherPath = await run('/agent-quickstart/', {
      headers: { 'Accept-Language': 'zh-CN' },
    });

    expect(chinese.status).toBe(302);
    expect(chinese.headers.get('Location')).toBe('https://example.com/zh/');
    expect(chinese.headers.get('Vary')).toBe('Accept, Accept-Language');
    expect(english.status).toBe(200);
    expect(english.headers.get('Vary')).toBe('Accept, Accept-Language');
    expect(await english.text()).toContain('<h1>Aether Documentation</h1>');
    expect(unspecified.status).toBe(200);
    expect(markdown.status).toBe(200);
    expect(await markdown.text()).toContain('Aether documentation.');
    expect(otherPath.status).toBe(200);
    expect(otherPath.headers.get('Vary')).toBe('Accept');
  });

  it('serves direct Markdown and text indexes with distinct content types', async () => {
    const markdown = await run('/agent-quickstart.md');
    const english = await run('/llms.txt');
    const chinese = await run('/zh/llms.txt');

    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(english.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await english.text()).toContain('## Overview');
    expect(await chinese.text()).toContain('## 概览');
  });

  it('returns plain-text protocol and Markdown lookup errors', async () => {
    const unsupported = await run('/agent-quickstart', { method: 'POST' });
    const missing = await run('/missing', {
      headers: { Accept: 'text/markdown' },
    });

    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('Allow')).toBe('GET, HEAD');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns bodyless HTML and Markdown responses to HEAD', async () => {
    const html = await run('/', { method: 'HEAD' });
    const markdown = await run('/', {
      method: 'HEAD',
      headers: { Accept: 'text/markdown' },
    });

    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await html.text()).toBe('');
    expect(await markdown.text()).toBe('');
  });

  it('converts Markdown asset failures into plain-text 503 responses', async () => {
    const response = await run(
      '/agent-quickstart',
      { headers: { Accept: 'text/markdown' } },
      { throwOnFetch: true }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });
});
