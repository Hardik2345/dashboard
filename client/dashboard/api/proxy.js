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
  delete headers['accept-encoding']; // upstream will set its own encoding

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
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await upstreamRes.arrayBuffer());
  res.send(buf);
}
