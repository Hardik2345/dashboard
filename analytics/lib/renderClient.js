// Simple Render API client for env var management and deploy triggers
// Uses RENDER_API_KEY and SERVICE_ID from environment.
// Exposes: fetchEnvVars, upsertBrandsConfig, triggerDeploy

const BASE_URL = process.env.RENDER_API_BASE || 'https://api.render.com/v1';

async function http(method, path, { body, retry = 2, expectedStatus } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
    'Accept': 'application/json'
  };
  if (body) headers['Content-Type'] = 'application/json';
  let attempt = 0; let lastErr;
  while (attempt <= retry) {
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let json; try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
      if (expectedStatus && !expectedStatus.includes(res.status)) {
        const err = new Error(`Render API ${method} ${path} -> ${res.status}`);
        err.status = res.status; err.body = json; throw err;
      }
      if (!res.ok && !expectedStatus) {
        const err = new Error(`Render API ${method} ${path} -> ${res.status}`);
        err.status = res.status; err.body = json; throw err;
      }
      return { status: res.status, data: json };
    } catch (e) {
      lastErr = e;
      // retry on network or 429/5xx
      if (e.status && ![429,500,502,503,504].includes(e.status)) break;
      if (attempt === retry) break;
      const backoff = 300 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
    attempt++;
  }
  throw lastErr;
}

async function fetchEnvVars(serviceId) {
  const { data } = await http('GET', `/services/${serviceId}/env-vars`);
  return data; // array of { key, value } (value may be null for synced envs)
}

function buildBrandsConfigVar(brandsConfig) {
  return { key: 'BRANDS_CONFIG', value: JSON.stringify(brandsConfig) };
}

async function upsertBrandsConfig(serviceId, brandsConfig, existingVars) {
  // Render expects full replacement array for updates.
  const others = (existingVars || []).filter(v => v.key !== 'BRANDS_CONFIG');
  const payload = [...others, buildBrandsConfigVar(brandsConfig)];
  await http('PUT', `/services/${serviceId}/env-vars`, { body: payload, expectedStatus: [200] });
  return true;
}

async function triggerDeploy(serviceId, message) {
  const { data } = await http('POST', `/services/${serviceId}/deploys`, { body: { clearCache: false, message }, expectedStatus: [201,202] });
  return data; // includes id
}

module.exports = { fetchEnvVars, upsertBrandsConfig, triggerDeploy };
