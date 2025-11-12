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

export async function getTotalSalesDelta({ start, end, align, compare }) {
  const json = await getJSON('/metrics/total-sales-delta', { start, end, align, compare });
  return {
    date: json?.date || null,
    current: Number(json?.current || 0),
    previous: Number(json?.previous || 0),
    diff_pct: Number(json?.diff_pct || 0),
    direction: json?.direction || 'flat',
    compare: json?.compare,
    error: json?.__error,
  };
}

export async function getTotalOrders({ start, end }) {
  const json = await getJSON('/metrics/total-orders', { start, end });
  return { value: Number(json?.total_orders || 0), error: json?.__error };
}

export async function getTotalOrdersDelta({ start, end }) {
  const json = await getJSON('/metrics/total-orders-delta', { start, end });
  return {
    date: json?.date || null,
    current: Number(json?.current || 0),
    previous: Number(json?.previous || 0),
    diff_pct: Number(json?.diff_pct || 0),
    direction: json?.direction || 'flat',
    error: json?.__error,
  };
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

export async function getAOVDelta({ start, end, compare }) {
  const json = await getJSON('/metrics/aov-delta', { start, end, compare });
  return {
    date: json?.date || null,
    current: Number(json?.current || 0),
    previous: Number(json?.previous || 0),
    diff_pct: Number(json?.diff_pct || 0),
    direction: json?.direction || 'flat',
    compare: json?.compare,
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

export async function getCVRDelta({ start, end, align, compare }) {
  const json = await getJSON('/metrics/cvr-delta', { start, end, align, compare });
  return {
    date: json?.date || null,
    current: json?.current || null,
    previous: json?.previous || null,
    diff_pp: Number(json?.diff_pp || 0),
    direction: json?.direction || 'flat',
    align: json?.align || undefined,
    hour: typeof json?.hour === 'number' ? json.hour : undefined,
    compare: json?.compare,
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

export async function getTotalSessionsDelta({ start, end, align, compare }) {
  const json = await getJSON('/metrics/total-sessions-delta', { start, end, align, compare });
  return {
    date: json?.date || null,
    current: Number(json?.current || 0),
    previous: Number(json?.previous || 0),
    diff_pct: Number(json?.diff_pct || 0),
    direction: json?.direction || 'flat',
    compare: json?.compare,
    error: json?.__error,
  };
}

export async function getAtcSessionsDelta({ start, end, align, compare }) {
  const json = await getJSON('/metrics/atc-sessions-delta', { start, end, align, compare });
  return {
    date: json?.date || null,
    current: Number(json?.current || 0),
    previous: Number(json?.previous || 0),
    diff_pct: Number(json?.diff_pct || 0),
    direction: json?.direction || 'flat',
    compare: json?.compare,
    error: json?.__error,
  };
}

export async function getOrderSplit({ start, end }) {
  const json = await getJSON('/metrics/order-split', { start, end });
  const cod_orders = Number(json?.cod_orders || 0);
  const prepaid_orders = Number(json?.prepaid_orders || 0);
  const partially_paid_orders = Number(json?.partially_paid_orders || 0);
  const total = Number(json?.total_orders_from_split || (cod_orders + prepaid_orders + partially_paid_orders));
  const cod_percent = Number(json?.cod_percent || 0);
  const prepaid_percent = Number(json?.prepaid_percent || 0);
  const partially_paid_percent = Number(json?.partially_paid_percent || (total > 0 ? (partially_paid_orders / total) * 100 : 0));
  return { cod_orders, prepaid_orders, partially_paid_orders, total, cod_percent, prepaid_percent, partially_paid_percent, error: json?.__error };
}

export async function getPaymentSalesSplit({ start, end }) {
  const json = await getJSON('/metrics/payment-sales-split', { start, end });
  const cod_sales = Number(json?.cod_sales || 0);
  const prepaid_sales = Number(json?.prepaid_sales || 0);
  const partial_sales = Number(json?.partial_sales || 0);
  const total = Number(json?.total_sales_from_split || (cod_sales + prepaid_sales + partial_sales));
  const cod_percent = Number(json?.cod_percent || 0);
  const prepaid_percent = Number(json?.prepaid_percent || 0);
  const partial_percent = Number(json?.partial_percent || (total > 0 ? (partial_sales / total) * 100 : 0));
  // Backward-compatible return shape with new fields appended
  return { cod_sales, prepaid_sales, partial_sales, total, cod_percent, prepaid_percent, partial_percent, error: json?.__error };
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

export async function getHourlyTrend({ start, end, aggregate }) {
  const json = await getJSON('/metrics/hourly-trend', { start, end, aggregate });
  const comparison = json?.comparison;
  return {
    points: Array.isArray(json?.points) ? json.points : [],
    range: json?.range || null,
    timezone: json?.timezone || 'IST',
    alignHour: typeof json?.alignHour === 'number' ? json.alignHour : null,
    comparison: comparison ? {
      points: Array.isArray(comparison.points) ? comparison.points : [],
      range: comparison.range || null,
      alignHour: typeof comparison.alignHour === 'number' ? comparison.alignHour : null,
      hourSampleCount: Array.isArray(comparison.hourSampleCount) ? comparison.hourSampleCount : null,
    } : null,
    error: json?.__error,
  };
}

export async function getDailyTrend({ start, end }) {
  const json = await getJSON('/metrics/daily-trend', { start, end });
  return {
    days: Array.isArray(json?.days) ? json.days : [],
    comparison: json?.comparison && Array.isArray(json?.comparison?.days)
      ? { range: json.comparison.range || null, days: json.comparison.days }
      : null,
    range: json?.range || null,
    timezone: json?.timezone || 'IST',
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

// ---------------- Author: Session adjustments ----------------
export async function listAdjustmentBuckets({ brandKey, active } = {}) {
  const params = { brand_key: brandKey };
  if (active != null) params.active = active ? '1' : '0';
  return getJSON('/author/adjustment-buckets', params);
}

export async function createAdjustmentBucket(payload) {
  try {
    const res = await fetch(`${API_BASE}/author/adjustment-buckets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch (e) { return { error: true }; }
}

export async function updateAdjustmentBucket(id, payload) {
  try {
    const res = await fetch(`${API_BASE}/author/adjustment-buckets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch (e) { return { error: true }; }
}

export async function deactivateAdjustmentBucket(id, { brandKey, start, end }) {
  try {
    const params = new URLSearchParams({ brand_key: brandKey });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const url = `${API_BASE}/author/adjustment-buckets/${id}?${params.toString()}`;
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch (e) { return { error: true }; }
}

export async function activateAdjustmentBucket(id, { brandKey, start, end, onlyThisBucket = false }) {
  try {
    const params = new URLSearchParams({ brand_key: brandKey });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (onlyThisBucket) params.set('only_this_bucket', '1');
    const url = `${API_BASE}/author/adjustment-buckets/${id}/activate?${params.toString()}`;
    const res = await fetch(url, { method: 'POST', credentials: 'include' });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch (e) { return { error: true }; }
}

export async function previewAdjustments({ brandKey, start, end, bucketIds }) {
  const params = { brand_key: brandKey, start, end };
  if (Array.isArray(bucketIds) && bucketIds.length) params.bucket_ids = bucketIds.join(',');
  return getJSON('/author/adjustments/preview', params);
}

export async function applyAdjustments({ brandKey, start, end, bucketIds }) {
  try {
    const res = await fetch(`${API_BASE}/author/adjustments/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ brand_key: brandKey, start, end, bucket_ids: Array.isArray(bucketIds) && bucketIds.length ? bucketIds : undefined })
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch (e) { return { error: true }; }
}

// Author brands helper (list)
export async function listAuthorBrands() {
  return getJSON('/author/brands');
}
