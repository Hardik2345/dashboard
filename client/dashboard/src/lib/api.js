const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

function qs(params) {
  const parts = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function getJSON(path, params) {
  const url = `${API_BASE}${path}${qs(params || {})}`;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('API error', path, e);
    return { __error: true };
  }
}

// ---- Auth helpers -----------------------------------------------------------
export async function login(email, password) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) return { error: true, status: res.status, data: await res.json().catch(()=>({})) };
    return { error: false, data: await res.json() };
  } catch (e) { return { error: true }; }
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
}

export async function me() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    const json = await res.json();
    return { authenticated: true, user: json.user };
  } catch { return { authenticated: false }; }
}

export async function getTotalSales({ start, end }) {
  const json = await getJSON('/metrics/total-sales', { start, end });
  return { value: Number(json?.total_sales || 0), error: json?.__error };
}

export async function getTotalOrders({ start, end }) {
  const json = await getJSON('/metrics/total-orders', { start, end });
  return { value: Number(json?.total_orders || 0), error: json?.__error };
}

export async function getAOV({ start, end }) {
  const json = await getJSON('/metrics/aov', { start, end });
  return {
    aov: Number(json?.aov || 0),
    total_sales: Number(json?.total_sales || 0),
    total_orders: Number(json?.total_orders || 0),
    error: json?.__error,
  };
}

export async function getCVR({ start, end }) {
  const json = await getJSON('/metrics/cvr', { start, end });
  return {
    cvr: Number(json?.cvr || 0),
    cvr_percent: Number(json?.cvr_percent || 0),
    total_orders: Number(json?.total_orders || 0),
    total_sessions: Number(json?.total_sessions || 0),
    error: json?.__error,
  };
}

export async function getCVRDelta({ start, end }) {
  const json = await getJSON('/metrics/cvr-delta', { start, end });
  return {
    date: json?.date || null,
    current: json?.current || null,
    previous: json?.previous || null,
    diff_pp: Number(json?.diff_pp || 0),
    direction: json?.direction || 'flat',
    error: json?.__error,
  };
}

export async function getFunnelStats({ start, end }) {
  const json = await getJSON('/metrics/funnel-stats', { start, end });
  return {
    total_sessions: Number(json?.total_sessions || 0),
    total_atc_sessions: Number(json?.total_atc_sessions || 0),
    total_orders: Number(json?.total_orders || 0),
    error: json?.__error,
  };
}

export async function getOrderSplit({ start, end }) {
  const json = await getJSON('/metrics/order-split', { start, end });
  const cod_orders = Number(json?.cod_orders || 0);
  const prepaid_orders = Number(json?.prepaid_orders || 0);
  const total = Number(json?.total_orders_from_split || (cod_orders + prepaid_orders));
  const cod_percent = Number(json?.cod_percent || 0);
  const prepaid_percent = Number(json?.prepaid_percent || 0);
  return { cod_orders, prepaid_orders, total, cod_percent, prepaid_percent, error: json?.__error };
}

export async function getPaymentSalesSplit({ start, end }) {
  const json = await getJSON('/metrics/payment-sales-split', { start, end });
  const cod_sales = Number(json?.cod_sales || 0);
  const prepaid_sales = Number(json?.prepaid_sales || 0);
  const total = Number(json?.total_sales_from_split || (cod_sales + prepaid_sales));
  const cod_percent = Number(json?.cod_percent || 0);
  const prepaid_percent = Number(json?.prepaid_percent || 0);
  return { cod_sales, prepaid_sales, total, cod_percent, prepaid_percent, error: json?.__error };
}

export async function getHourlySalesCompare({ hours = 6 } = {}) {
  const json = await getJSON('/metrics/hourly-sales-compare', { hours });
  return {
    labels: Array.isArray(json?.labels) ? json.labels : [],
    current: json?.series?.current || [],
    yesterday: json?.series?.yesterday || [],
    error: json?.__error,
  };
}

// Fetch last updated timestamp from external service (not using API_BASE)
export async function getLastUpdatedPTS() {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
  const url = `${base}/external/last-updated/pts`;
  try {
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    const json = await res.json();
    return { raw: json["Last successful run completed at"], timezone: json.timezone, error: false };
  } catch (e) {
    console.error('Last updated fetch error', e);
    return { raw: null, timezone: null, error: true };
  }
}
