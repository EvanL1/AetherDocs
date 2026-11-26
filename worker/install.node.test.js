import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './entry.js';

const SCRIPT = '#!/usr/bin/env bash\nset -euo pipefail\nmain "$@"\n';
const SCRIPT_SOURCE =
  'https://raw.githubusercontent.com/EvanL1/AetherEdge/main/tools/aether/install.sh';
const SHELL_FAILURE = /^echo '[^']+' >&2\nexit 1\n$/;

const env = {
  ASSETS: {
    async fetch() {
      return new Response('missing', { status: 404 });
    },
  },
};

function run(path, init, host = 'get.aetheriot.ai') {
  return worker.fetch(new Request(`https://${host}${path}`, init), env);
}

function upstream(response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installer endpoint', () => {
  it.each(['/', '/install.sh'])('serves the upstream script at %s', async (path) => {
    const fetchSpy = upstream(() => new Response(SCRIPT));

    const response = await run(path, { headers: { Accept: '*/*' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe(SCRIPT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(SCRIPT_SOURCE);
  });

  it('sends a browser at the root to the getting-started guide', async () => {
    const fetchSpy = upstream(() => new Response(SCRIPT));

    const response = await run('/', {
      headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://docs.aetheriot.ai/guides/getting-started/',
    );
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the script to a browser that asks for /install.sh', async () => {
    upstream(() => new Response(SCRIPT));

    const response = await run('/install.sh', { headers: { Accept: 'text/html' } });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SCRIPT);
  });

  it.each([
    ['an upstream error status', () => new Response('rate limited', { status: 429 })],
    ['an upstream body that is not a script', () => new Response('<!doctype html>')],
    [
      'an unreachable upstream',
      () => {
        throw new Error('network');
      },
    ],
  ])('fails closed with a shell-safe body on %s', async (_label, response) => {
    upstream(response);

    const result = await run('/');

    expect(result.status).toBe(502);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.text()).toMatch(SHELL_FAILURE);
  });

  it('answers an unknown path with a shell-safe 404 and no upstream call', async () => {
    const fetchSpy = upstream(() => new Response(SCRIPT));

    const response = await run('/llms.txt');

    expect(response.status).toBe(404);
    expect(await response.text()).toMatch(SHELL_FAILURE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers HEAD without a body', async () => {
    upstream(() => new Response(SCRIPT));

    const response = await run('/', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('rejects methods other than GET and HEAD', async () => {
    const response = await run('/', { method: 'POST' });

    expect(response.status).toBe(405);
  });

  it('does not serve the script from the documentation host', async () => {
    const fetchSpy = upstream(() => new Response(SCRIPT));

    const response = await run('/install.sh', undefined, 'docs.aetheriot.ai');

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
