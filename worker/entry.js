const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const LEGACY_GUIDE_PATHS = new Map([
  ['/tutorials/edge-contracts-cloud', '/guides/edge-contracts-cloud/'],
  ['/tutorials/edge-contracts-cloud/', '/guides/edge-contracts-cloud/'],
  ['/tutorials/edge-contracts-cloud.md', '/guides/edge-contracts-cloud.md'],
  ['/zh/tutorials/edge-contracts-cloud', '/zh/guides/edge-contracts-cloud/'],
  ['/zh/tutorials/edge-contracts-cloud/', '/zh/guides/edge-contracts-cloud/'],
  ['/zh/tutorials/edge-contracts-cloud.md', '/zh/guides/edge-contracts-cloud.md'],
]);

function successHeaders(sourceHeaders, contentType, vary = 'Accept') {
  const headers = new Headers(sourceHeaders);
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Vary', vary);
  return headers;
}

function plainResponse(message, status, requestMethod, extraHeaders) {
  const headers = successHeaders(extraHeaders, TEXT_CONTENT_TYPE);
  headers.set('Cache-Control', 'no-store');
  return new Response(requestMethod === 'HEAD' ? null : message, { status, headers });
}

function markdownAssetPath(pathname) {
  if (pathname === '/') return '/index.md';
  if (pathname.endsWith('.md')) return pathname;
  const trimmedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const lastSegment = trimmedPath.slice(trimmedPath.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return null;
  return `${trimmedPath}.md`;
}

function legacyGuideRedirect(url) {
  const pathname = LEGACY_GUIDE_PATHS.get(url.pathname);
  if (!pathname) return null;

  const redirectUrl = new URL(url);
  redirectUrl.pathname = pathname;
  return Response.redirect(redirectUrl, 308);
}

// English moved from /en/ to the site root. Permanently redirect every legacy
// /en URL to the same path with the prefix stripped, preserving query strings.
function legacyEnglishPrefixRedirect(url) {
  const { pathname } = url;
  let stripped = null;
  if (pathname === '/en' || pathname === '/en/') stripped = '/';
  else if (pathname === '/en.md') stripped = '/index.md';
  else if (pathname.startsWith('/en/')) stripped = pathname.slice('/en'.length);
  if (stripped === null) return null;

  const redirectUrl = new URL(url);
  redirectUrl.pathname = stripped;
  return Response.redirect(redirectUrl, 301);
}

// True when the request's Referer is same-origin with the current request.
// An in-site navigation — most importantly, clicking the language switcher
// from a Chinese page back to the English root — must not be overridden by
// Accept-Language negotiation, or a Chinese-preferring browser could never
// reach the English root through the site's own UI. A cold visit (typed
// URL, bookmark, external link, or no referrer) still gets negotiated.
function isSameOriginNavigation(request, url) {
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

// True when the Accept-Language header ranks some Chinese variant strictly
// above every English variant. Absent languages count as q=0; ties keep the
// English root experience.
function prefersChinese(acceptLanguage) {
  if (!acceptLanguage) return false;
  let chinese = 0;
  let english = 0;
  for (const part of acceptLanguage.split(',')) {
    const [rawTag, ...params] = part.trim().split(';');
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let quality = 1;
    for (const param of params) {
      const match = param.trim().match(/^q=(\d+(?:\.\d+)?)$/i);
      if (match) quality = Number.parseFloat(match[1]);
    }
    if (tag === 'zh' || tag.startsWith('zh-')) chinese = Math.max(chinese, quality);
    if (tag === 'en' || tag.startsWith('en-')) english = Math.max(english, quality);
  }
  return chinese > english;
}

async function fetchAsset(request, env, assetPath) {
  const sourceUrl = new URL(request.url);
  const assetUrl = assetPath ? new URL(assetPath, sourceUrl) : sourceUrl;
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return plainResponse('Method not allowed.\n', 405, request.method, {
        Allow: 'GET, HEAD',
      });
    }

    const url = new URL(request.url);
    const englishRedirect = legacyEnglishPrefixRedirect(url);
    if (englishRedirect) return englishRedirect;
    const redirect = legacyGuideRedirect(url);
    if (redirect) return redirect;

    const accept = request.headers.get('Accept') || '';
    const wantsMarkdown = url.pathname.endsWith('.md') || accept.includes('text/markdown');

    // Language negotiation applies to HTML requests for exactly the root
    // path, and only on a cold visit — not when the visitor just clicked
    // there from elsewhere on this site. Requests for /index.md, any
    // Markdown representation, or any other path are never negotiated.
    const negotiatesLanguage =
      url.pathname === '/' && !wantsMarkdown && !isSameOriginNavigation(request, url);
    if (negotiatesLanguage && prefersChinese(request.headers.get('Accept-Language'))) {
      const redirectUrl = new URL(url);
      redirectUrl.pathname = '/zh/';
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl.toString(),
          Vary: 'Accept, Accept-Language',
        },
      });
    }

    if (wantsMarkdown) {
      const assetPath = markdownAssetPath(url.pathname);
      if (assetPath === null) {
        return plainResponse('Document not found. See /llms.txt for the index.\n', 404, request.method);
      }

      let response;
      try {
        response = await fetchAsset(request, env, assetPath);
      } catch {
        return plainResponse('Documentation temporarily unavailable.\n', 503, request.method);
      }
      if (!response.ok) {
        return plainResponse('Document not found. See /llms.txt for the index.\n', 404, request.method);
      }

      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        headers: successHeaders(response.headers, MARKDOWN_CONTENT_TYPE),
      });
    }

    let response;
    try {
      response = await fetchAsset(request, env);
    } catch {
      return plainResponse('Documentation temporarily unavailable.\n', 503, request.method);
    }
    const contentType = url.pathname.endsWith('.txt') ? TEXT_CONTENT_TYPE : undefined;
    const vary = negotiatesLanguage ? 'Accept, Accept-Language' : 'Accept';
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: successHeaders(response.headers, contentType, vary),
    });
  },
};
