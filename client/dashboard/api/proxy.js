// Lightweight proxy so the upstream API base can be set via env (API_BASE_URL).
// Keeps Vercel rewrites dynamic without hardcoding the backend host.
export default async function handler(req, res) {
  const targetBase = (process.env.API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!targetBase) {
    res.status(500).json({ error: 'API_BASE_URL not configured' });
    return;
  }

  const { path, ...query } = req.query || {};
  const cleanedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
  const url = new URL(targetBase + cleanedPath);
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
    body: body && ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });

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
  const rawSetCookies = upstreamRes.headers.raw?.()['set-cookie'] || [];
  const singleSetCookie = upstreamRes.headers.get('set-cookie');
  const cookies = rawSetCookies.length ? rawSetCookies : (singleSetCookie ? [singleSetCookie] : []);
  if (cookies.length) {
    const rewritten = cookies.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
    res.setHeader('Set-Cookie', rewritten);
  }
  const buf = Buffer.from(await upstreamRes.arrayBuffer());
  res.send(buf);
}
