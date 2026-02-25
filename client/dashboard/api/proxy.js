// Lightweight proxy so the upstream API base can be set via env (API_BASE_URL).
// Keeps Vercel rewrites dynamic without hardcoding the backend host.
export const config = {
  runtime: 'nodejs',
};

export default async function handler(req, res) {
  try {
    const targetBase = (process.env.API_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!targetBase) {
      res.status(500).json({ error: 'API_BASE_URL not configured' });
      return;
    }

    const { path, ...query } = req.query || {};
    const cleanedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
    const passthroughPrefixes = ['/auth', '/alerts', '/tenant', '/push'];
    const shouldPassthrough = passthroughPrefixes.some((prefix) => cleanedPath === prefix || cleanedPath.startsWith(`${prefix}/`));
    const upstreamPath = shouldPassthrough ? cleanedPath : `/analytics${cleanedPath}`;
    const url = new URL(targetBase + upstreamPath);
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v));
      } else if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    }

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    // Request upstream in identity encoding to avoid decode mismatches on the client.
    headers['accept-encoding'] = 'identity';

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const upstreamRes = await fetch(url, {
      method: req.method,
      headers,
      redirect: 'manual', // preserve upstream redirects; handle safely below
      body: body && ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });

    // If upstream wants to redirect (e.g., /auth/google 302), forward it as-is.
    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      const location = upstreamRes.headers.get('location');
      if (location) {
        let rewrittenLocation = location;
        try {
          const targetUrl = new URL(targetBase);
          const locationUrl = new URL(location, targetBase);
          if (locationUrl.hostname === targetUrl.hostname && locationUrl.protocol === 'http:') {
            locationUrl.protocol = targetUrl.protocol;
            locationUrl.port = targetUrl.port;
            rewrittenLocation = locationUrl.toString();
          }
          // If the redirect stays on the same upstream host, follow it server-side to avoid CORS.
          if (locationUrl.hostname === targetUrl.hostname) {
            let followUrl = locationUrl;
            if (followUrl.pathname.startsWith('/alerts') && followUrl.pathname.endsWith('/') && followUrl.pathname !== '/') {
              followUrl = new URL(followUrl.toString());
              followUrl.pathname = followUrl.pathname.replace(/\/+$/, '');
            }
            let nextUrl = followUrl.toString();
            let followRes = await fetch(nextUrl, {
              method: req.method,
              headers,
              redirect: 'manual',
              body: body && ['GET', 'HEAD'].includes(req.method) ? undefined : body,
            });
            for (let i = 0; i < 3 && followRes.status >= 300 && followRes.status < 400; i += 1) {
              const nextLocation = followRes.headers.get('location');
              if (!nextLocation) break;
              const nextLocationUrl = new URL(nextLocation, targetBase);
              if (nextLocationUrl.hostname !== targetUrl.hostname) break;
              if (nextLocationUrl.protocol === 'http:') {
                nextLocationUrl.protocol = targetUrl.protocol;
                nextLocationUrl.port = targetUrl.port;
              }
              if (nextLocationUrl.pathname.startsWith('/alerts') && nextLocationUrl.pathname.endsWith('/') && nextLocationUrl.pathname !== '/') {
                nextLocationUrl.pathname = nextLocationUrl.pathname.replace(/\/+$/, '');
              }
              nextUrl = nextLocationUrl.toString();
              followRes = await fetch(nextUrl, {
                method: req.method,
                headers,
                redirect: 'manual',
                body: body && ['GET', 'HEAD'].includes(req.method) ? undefined : body,
              });
            }
            res.status(followRes.status);
            followRes.headers.forEach((value, key) => {
              const k = key.toLowerCase();
              if (k === 'transfer-encoding') return;
              if (k === 'content-encoding') return;
              if (k === 'content-length') return;
              if (k === 'set-cookie') return;
              res.setHeader(key, value);
            });
            const followCookies = typeof followRes.headers.getSetCookie === 'function' ? followRes.headers.getSetCookie() : [];
            const followRawCookies = followRes.headers.raw?.()['set-cookie'] || [];
            const followSingleCookie = followRes.headers.get('set-cookie');
            const cookies = (followCookies && followCookies.length)
              ? followCookies
              : (followRawCookies.length ? followRawCookies : (followSingleCookie ? [followSingleCookie] : []));
            if (cookies.length) {
              const rewritten = cookies.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
              res.setHeader('Set-Cookie', rewritten);
            }
            const buf = Buffer.from(await followRes.arrayBuffer());
            res.send(buf);
            return;
          }
        } catch {
          // Fall back to the original Location header if parsing fails.
        }
        res.setHeader('Location', rewrittenLocation);
      }
      // Forward Set-Cookie on redirects so sessions stick after auth flows.
      const fromGet = typeof upstreamRes.headers.getSetCookie === 'function' ? upstreamRes.headers.getSetCookie() : [];
      const rawSetCookies = upstreamRes.headers.raw?.()['set-cookie'] || [];
      const singleSetCookie = upstreamRes.headers.get('set-cookie');
      const cookies = (fromGet && fromGet.length)
        ? fromGet
        : (rawSetCookies.length ? rawSetCookies : (singleSetCookie ? [singleSetCookie] : []));
      if (cookies.length) {
        const rewritten = cookies.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
        res.setHeader('Set-Cookie', rewritten);
      }
      res.status(upstreamRes.status);
      res.end();
      return;
    }

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === 'transfer-encoding') return;
      if (k === 'content-encoding') return;
      if (k === 'content-length') return;
      if (k === 'set-cookie') return; // handled separately to adjust domain
      res.setHeader(key, value);
    });

    // Rewrite Set-Cookie to drop the upstream domain so the cookie sticks to the Vercel host.
    // Vercel/Node fetch exposes cookies via getSetCookie(); raw() is not guaranteed.
    const fromGet = typeof upstreamRes.headers.getSetCookie === 'function' ? upstreamRes.headers.getSetCookie() : [];
    const rawSetCookies = upstreamRes.headers.raw?.()['set-cookie'] || [];
    const singleSetCookie = upstreamRes.headers.get('set-cookie');
    const cookies = (fromGet && fromGet.length)
      ? fromGet
      : (rawSetCookies.length ? rawSetCookies : (singleSetCookie ? [singleSetCookie] : []));
    if (cookies.length) {
      const rewritten = cookies.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
      res.setHeader('Set-Cookie', rewritten);
    }
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    res.send(buf);
  } catch (error) {
    console.error('API proxy failed', error);
    res.status(502).json({ error: 'Upstream request failed' });
  }
}
