export const INSTALL_HOST = 'get.aetheriot.ai';

const SCRIPT_SOURCE =
  'https://raw.githubusercontent.com/EvanL1/AetherEdge/main/tools/aether/install.sh';
const GUIDE_URL = 'https://docs.aetheriot.ai/guides/getting-started/';
const SCRIPT_PATHS = new Set(['/', '/install.sh']);
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const CACHE_SECONDS = 300;

// Error bodies are valid shell: `curl … | bash` without -f pipes them into bash.
function failure(status, message, bodiless) {
  return new Response(bodiless ? null : `echo '${message}' >&2\nexit 1\n`, {
    status,
    headers: { 'Content-Type': TEXT_CONTENT_TYPE, 'Cache-Control': 'no-store' },
  });
}

async function fetchScript() {
  try {
    const response = await fetch(SCRIPT_SOURCE, {
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

export async function installResponse(request, url) {
  const bodiless = request.method === 'HEAD';
  if (!SCRIPT_PATHS.has(url.pathname)) {
    return failure(404, `Not found. Install with: curl -fsSL https://${INSTALL_HOST} | bash`, bodiless);
  }

  const accept = request.headers.get('Accept') || '';
  if (url.pathname === '/' && accept.includes('text/html')) {
    return new Response(null, { status: 302, headers: { Location: GUIDE_URL, Vary: 'Accept' } });
  }

  const script = await fetchScript();
  if (!script.startsWith('#!')) {
    return failure(502, `Aether installer is temporarily unavailable. See ${GUIDE_URL}`, bodiless);
  }
  return new Response(bodiless ? null : script, {
    headers: {
      'Content-Type': TEXT_CONTENT_TYPE,
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      Vary: 'Accept',
    },
  });
}
