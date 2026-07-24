import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './entry.js';

async function run(path, init) {
  const request = new Request(`https://example.com${path}`, init);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dual-mode documentation service', () => {
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
    ['/en/agent-quickstart/', 'https://example.com/agent-quickstart/'],
    ['/en/agent-quickstart.md?ref=index', 'https://example.com/agent-quickstart.md?ref=index'],
  ])('permanently strips the retired /en prefix from %s', async (path, location) => {
    const response = await run(path, { redirect: 'manual' });

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe(location);
  });

  it('serves HTML to a normal browser request', async () => {
    const response = await run('/agent-quickstart/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(await response.text()).toContain('<h1>Agent Quickstart</h1>');
  });

  it('serves Markdown when the client requests text/markdown', async () => {
    const response = await run('/agent-quickstart/', {
      headers: { Accept: 'text/markdown' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(await response.text()).toMatch(/^# Agent Quickstart/);
  });

  it('serves the independent Chinese locale under /zh', async () => {
    const html = await run('/zh/agent-quickstart/');
    const markdown = await run('/zh/agent-quickstart/', {
      headers: { Accept: 'text/markdown' },
    });

    expect(await html.text()).toContain('<h1>智能体快速入门</h1>');
    expect(await markdown.text()).toMatch(/^# 智能体快速入门/);
  });

  it('serves direct .md routes as Markdown', async () => {
    const response = await run('/agent-quickstart.md');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
  });

  it('maps the root to HTML or Markdown according to the request', async () => {
    const html = await run('/');
    const markdown = await run('/', { headers: { Accept: 'text/markdown' } });

    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await markdown.text()).toMatch(/^# Aether/);
  });

  it('redirects a Chinese-preferring browser from the root to /zh/', async () => {
    const response = await run('/', {
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://example.com/zh/');
    expect(response.headers.get('Vary')).toBe('Accept, Accept-Language');
  });

  it('serves English at the root to an English-preferring browser', async () => {
    const response = await run('/', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Vary')).toBe('Accept, Accept-Language');
    expect(await response.text()).toContain('<h1>Aether Documentation</h1>');
  });

  it('never negotiates language for the root Markdown representation', async () => {
    const markdown = await run('/', {
      headers: {
        Accept: 'text/markdown',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const twin = await run('/index.md', {
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });

    expect(markdown.status).toBe(200);
    expect(await markdown.text()).toMatch(/^# Aether/);
    expect(twin.status).toBe(200);
    expect(twin.headers.get('Vary')).toBe('Accept');
  });

  it('leaves non-root paths untouched by language negotiation', async () => {
    const response = await run('/agent-quickstart/', {
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(await response.text()).toContain('<h1>Agent Quickstart</h1>');
  });

  it('serves generated agent indexes as text/plain', async () => {
    const english = await run('/llms.txt');
    const chinese = await run('/zh/llms.txt');

    expect(english.status).toBe(200);
    expect(english.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await english.text()).toContain('## Overview');
    expect(await chinese.text()).toContain('## 概览');
  });

  it('returns a plain-text 404 when a requested Markdown twin does not exist', async () => {
    const response = await run('/missing-document', {
      headers: { Accept: 'text/markdown' },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns a plain-text 405 for unsupported methods', async () => {
    const response = await run('/agent-quickstart', { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('returns the selected representation without a body for HEAD', async () => {
    const html = await run('/agent-quickstart/', { method: 'HEAD' });
    const markdown = await run('/agent-quickstart/', {
      method: 'HEAD',
      headers: { Accept: 'text/markdown' },
    });

    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await html.text()).toBe('');
    expect(await markdown.text()).toBe('');
  });

  it('returns a plain-text 503 when the Markdown asset lookup fails', async () => {
    vi.spyOn(env.ASSETS, 'fetch').mockRejectedValueOnce(new Error('binding unavailable'));

    const response = await run('/agent-quickstart', {
      headers: { Accept: 'text/markdown' },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });
});
