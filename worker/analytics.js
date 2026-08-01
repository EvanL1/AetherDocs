// Server-side request capture for PostHog.
//
// The browser snippet in the site layout only fires for clients that execute
// JavaScript, so it reports humans and nothing else. This module runs in the
// Worker, which sees every request — including `llms.txt` and Markdown fetches
// from agents, which are the audience this documentation exists for and the one
// a beacon can never observe.
//
// Capture is best-effort. It runs inside `waitUntil` and swallows its own
// errors: an analytics outage must never delay or fail a documentation request.

const INGEST_URL = 'https://us.i.posthog.com/i/v0/e/';

/// Paths only ever requested by vulnerability scanners. Excluding them keeps
/// the event quota spent on real traffic; the CDN still counts them.
const SCANNER_PREFIXES = [
  '/wp-',
  '/wordpress',
  '/.env',
  '/.git',
  '/.aws',
  '/phpmyadmin',
  '/xmlrpc.php',
  '/vendor/',
  '/cgi-bin/',
];

/// The two agent indexes. Requests for these are the clearest signal that a
/// machine reader is using the documentation as an index rather than a page.
const AGENT_INDEX_PATHS = new Set(['/llms.txt', '/zh/llms.txt']);

export function isScannerPath(pathname) {
  const lowered = pathname.toLowerCase();
  return SCANNER_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

/// Pseudonymous, stable-per-day source identifier.
///
/// PostHog requires a `distinct_id`. Sending the raw client IP would put
/// visitor addresses in a third-party system for no analytical gain: every
/// question worth asking here is "how many distinct sources" and "which
/// paths", not "who". A non-cryptographic hash answers both without carrying
/// the address off the edge.
export function sourceId(ip, userAgent) {
  let hash = 0x811c9dc5;
  for (const value of `${ip}|${userAgent}`) {
    hash ^= value.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `src_${hash.toString(36)}`;
}

export function representationOf(pathname, accept) {
  if (pathname.endsWith('.txt')) return 'text';
  if (pathname.endsWith('.md') || accept.includes('text/markdown')) return 'markdown';
  return 'html';
}

export function buildEvent(request, url, apiKey) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const accept = request.headers.get('accept') ?? '';
  return {
    api_key: apiKey,
    event: 'documentation_request',
    distinct_id: sourceId(request.headers.get('cf-connecting-ip') ?? '', userAgent),
    properties: {
      path: url.pathname,
      // The legacy host still answers with a redirect, so keeping it on the
      // event is what separates migration traffic from product traffic.
      host: url.hostname,
      user_agent: userAgent,
      representation: representationOf(url.pathname, accept),
      agent_index: AGENT_INDEX_PATHS.has(url.pathname),
      // Anonymous server-side events must not create person profiles: every
      // crawler would otherwise become a tracked person.
      $process_person_profile: false,
    },
  };
}

/// Records one request. Does nothing when `POSTHOG_KEY` is unset, which is the
/// case in local development and in the Worker test suite.
export function recordRequest(request, url, env, ctx) {
  if (!env?.POSTHOG_KEY || !ctx?.waitUntil) return;
  if (isScannerPath(url.pathname)) return;

  ctx.waitUntil(
    fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildEvent(request, url, env.POSTHOG_KEY)),
    }).catch(() => {}),
  );
}
