// Tests for the analytics helpers. Written with the Vitest API so this file
// runs under both the plain-Node pool and the workerd pool, matching
// entry.node.test.js.
import { describe, expect, it, vi } from 'vitest';

import {
  buildEvent,
  isScannerPath,
  recordRequest,
  representationOf,
  sourceId,
} from './analytics.js';

function requestWith(headers = {}) {
  return new Request('https://docs.aetheriot.ai/', { headers });
}

describe('path selection', () => {
  it('excludes scanner paths so the event quota buys real traffic', () => {
    for (const path of ['/wp-login.php', '/.env', '/.git/config', '/vendor/phpunit']) {
      expect(isScannerPath(path), path).toBe(true);
    }
    for (const path of ['/llms.txt', '/guides/deployment/', '/zh/', '/reference/http-api.md']) {
      expect(isScannerPath(path), path).toBe(false);
    }
  });

  it('recognises Markdown by suffix and by Accept', () => {
    expect(representationOf('/guides/deployment.md', '')).toBe('markdown');
    expect(representationOf('/guides/deployment/', 'text/markdown')).toBe('markdown');
    expect(representationOf('/guides/deployment/', 'text/html')).toBe('html');
  });
});

describe('event shape', () => {
  it('marks the agent index, which is what a browser beacon cannot see', () => {
    const index = buildEvent(requestWith(), new URL('https://docs.aetheriot.ai/llms.txt'), 'k');
    expect(index.properties.agent_index).toBe(true);
    expect(index.properties.representation).toBe('text');

    const page = buildEvent(requestWith(), new URL('https://docs.aetheriot.ai/guides/'), 'k');
    expect(page.properties.agent_index).toBe(false);
    expect(page.properties.representation).toBe('html');
  });

  it('keeps the legacy host so migration traffic stays separable', () => {
    const legacy = buildEvent(requestWith(), new URL('https://docs.aetheriot.dev/llms.txt'), 'k');
    expect(legacy.properties.host).toBe('docs.aetheriot.dev');
  });

  it('does not create a person profile for every crawler', () => {
    const event = buildEvent(requestWith(), new URL('https://docs.aetheriot.ai/'), 'k');
    expect(event.properties.$process_person_profile).toBe(false);
  });
});

describe('client address handling', () => {
  it('sends no raw client address', () => {
    const request = requestWith({
      'cf-connecting-ip': '203.0.113.7',
      'user-agent': 'ClaudeBot/1.0',
    });
    const event = buildEvent(request, new URL('https://docs.aetheriot.ai/llms.txt'), 'k');
    expect(JSON.stringify(event)).not.toContain('203.0.113.7');
    expect(event.distinct_id).toMatch(/^src_/);
  });

  it('derives a stable id per source that differs between sources', () => {
    expect(sourceId('203.0.113.7', 'ClaudeBot/1.0')).toBe(sourceId('203.0.113.7', 'ClaudeBot/1.0'));
    expect(sourceId('203.0.113.7', 'ClaudeBot/1.0')).not.toBe(
      sourceId('203.0.113.8', 'ClaudeBot/1.0'),
    );
  });
});

describe('capture is best-effort', () => {
  it('is inert without a key, which is local development and CI', () => {
    const waitUntil = vi.fn();
    recordRequest(requestWith(), new URL('https://docs.aetheriot.ai/'), {}, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('skips scanner paths before spending an event', () => {
    const waitUntil = vi.fn();
    recordRequest(
      requestWith(),
      new URL('https://docs.aetheriot.ai/wp-login.php'),
      { POSTHOG_KEY: 'phc_test' },
      { waitUntil },
    );
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('cannot fail or delay a documentation request when ingest is down', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ingest unreachable')));
    const pending = [];
    try {
      recordRequest(
        requestWith(),
        new URL('https://docs.aetheriot.ai/llms.txt'),
        { POSTHOG_KEY: 'phc_test' },
        { waitUntil: (promise) => pending.push(promise) },
      );
      expect(pending).toHaveLength(1);
      // The rejection is swallowed inside the module; awaiting must not throw.
      await expect(pending[0]).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
