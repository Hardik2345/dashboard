function resolveApiBase() {
  const envBase = (import.meta.env.VITE_API_BASE || '').trim();
  if (!envBase) return '/api';

  // If env base is absolute but on a different host, fall back to same-origin proxy to keep cookies working.
  try {
    const envUrl = new URL(envBase, window.location.origin);
    if (envUrl.origin !== window.location.origin) {
      return '/api';
    }
  } catch {
    // Ignore parse errors, fall through to envBase
  }
  return envBase;
}

// Keep API calls on same origin so session cookies stick.
const API_BASE = resolveApiBase();

function qs(params) {
  const parts = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function normalizeBrandKey(src) {
  if (!src) return '';
  return src.toString().trim().toUpperCase();
}

function appendBrandKey(params, source) {
  const key = normalizeBrandKey(source?.brand_key ?? source?.brandKey);
  if (key) return { ...params, brand_key: key };
  return params;
}

function formatDateRangeSuffix(start, end) {
  const s = (start || '').toString().trim();
  const e = (end || '').toString().trim();
  if (s && e) return s === e ? s : `${s}_to_${e}`;
  if (s) return s;
  if (e) return e;
  return '';
}

function filenameFromDisposition(disposition) {
  if (!disposition) return null;
  const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return null;
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

// Generic helpers returning { error, data, status }
async function doGet(path, params, options = {}) {
  const url = `${API_BASE}${path}${qs(params || {})}`;
  try {
    const res = await fetch(url, { credentials: 'include', signal: options.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: true, status: res.status, data: json };
    return { error: false, data: json };
  } catch {
    return { error: true };
  }
}

async function doPost(path, body) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: true, status: res.status, data: json };
    return { error: false, data: json };
  } catch {
    return { error: true };
  }
}

async function doPut(path, body) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: true, status: res.status, data: json };
    return { error: false, data: json };
  } catch {
    return { error: true };
  }
}

async function doDelete(path) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    // Some deletes return 204 with no JSON
    let json = {};
    try { json = await res.json(); } catch {
      // Ignore empty JSON bodies on delete
    }
    if (!res.ok) return { error: true, status: res.status, data: json };
    return { error: false, data: json };
  } catch {
    return { error: true };
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
  } catch {
    return { error: true };
  }
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // ignore logout errors
  }
}

export async function me() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    const json = await res.json();
    return { authenticated: true, user: json.user, expiresAt: json.expiresAt };
  } catch {
    return { authenticated: false };
  }
}

export async function sendHeartbeat(meta = null) {
  try {
    const res = await fetch(`${API_BASE}/activity/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ meta }),
    });
    return { error: !res.ok };
  } catch {
    return { error: true };
  }
}

// ---- Author Access Control APIs -------------------------------------------
export async function getAccessControl() {
  return doGet('/author/access-control');
}
export async function setAccessMode(mode) {
  return doPost('/author/access-control/mode', { mode });
}
export async function setAccessSettings({ autoProvision }) {
  return doPost('/author/access-control/settings', { autoProvision });
}
export async function listWhitelist() {
  return doGet('/author/access-control/whitelist');
}
export async function addWhitelist(email, brand_key, notes) {
  return doPost('/author/access-control/whitelist', { email, brand_key, notes });
}
export async function removeWhitelist(id) {
  return doDelete(`/author/access-control/whitelist/${id}`);
}

export async function getDashboardSummary(args) {
  const params = appendBrandKey({
    start: args.start || args.date,
    end: args.end || args.date || args.start,
  }, args);
  const json = await getJSON('/metrics/summary', params);
  return {
    metrics: json?.metrics || null,
    range: json?.range || { start: params.start || null, end: params.end || null },
    prev_range: json?.prev_range || null,
    error: json?.__error
  };
}

export async function getDeltaSummary(args) {
  const params = appendBrandKey({
    start: args.start || args.date,
    end: args.end || args.date || args.start,
    align: args.align,
    compare: args.compare,
  }, args);
  const json = await getJSON('/metrics/delta-summary', params);
  return {
    metrics: json?.metrics || null,
    range: json?.range || { start: params.start || null, end: params.end || null },
    prev_range: json?.prev_range || null,
    error: json?.__error
  };
}

export async function getProductConversion(args, options = {}) {
  const params = appendBrandKey({
    start: args.start,
    end: args.end,
    page: args.page,
    page_size: args.pageSize,
    sort_by: args.sortBy,
    sort_dir: args.sortDir,
  }, args);
  const res = await doGet('/metrics/product-conversion', params, { signal: options.signal });
  if (res.error) return { error: true };
  const json = res.data || {};
  return {
    rows: Array.isArray(json?.rows) ? json.rows : [],
    total_count: Number(json?.total_count || 0),
    page: Number(json?.page || 1),
    page_size: Number(json?.page_size || Number(params.page_size) || 10),
    range: json?.range || null,
    error: false,
  };
}

export async function exportProductConversionCsv(args) {
  const params = appendBrandKey({
    start: args.start,
    end: args.end,
    sort_by: args.sortBy,
    sort_dir: args.sortDir,
  }, args);
  const dateSuffix = formatDateRangeSuffix(params.start, params.end);
  const fallbackName = dateSuffix ? `product_conversion_${dateSuffix}.csv` : 'product_conversion.csv';
  const url = `${resolveApiBase()}/metrics/product-conversion/export${qs(params)}`;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { error: true, status: res.status };
    const blob = await res.blob();
    const fromHeader = filenameFromDisposition(res.headers.get('Content-Disposition'));
    return { error: false, blob, filename: fromHeader || fallbackName };
  } catch (e) {
    console.error('API error product-conversion csv', e);
    return { error: true };
  }
}

export async function getOrderSplit(args) {
  const params = appendBrandKey({ start: args.start, end: args.end, product_id: args.product_id }, args);
  const json = await getJSON('/metrics/order-split', params);
  const cod_orders = Number(json?.cod_orders || 0);
  const prepaid_orders = Number(json?.prepaid_orders || 0);
  const partially_paid_orders = Number(json?.partially_paid_orders || 0);
  const total = Number(json?.total_orders_from_split || (cod_orders + prepaid_orders + partially_paid_orders));
  const cod_percent = Number(json?.cod_percent || 0);
  const prepaid_percent = Number(json?.prepaid_percent || 0);
  const partially_paid_percent = Number(json?.partially_paid_percent || (total > 0 ? (partially_paid_orders / total) * 100 : 0));
  return { cod_orders, prepaid_orders, partially_paid_orders, total, cod_percent, prepaid_percent, partially_paid_percent, error: json?.__error };
}

export async function getPaymentSalesSplit(args) {
  const params = appendBrandKey({ start: args.start, end: args.end, product_id: args.product_id }, args);
  const json = await getJSON('/metrics/payment-sales-split', params);
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

export async function getHourlySalesSummary(args = {}) {
  const params = appendBrandKey({}, args);
  const json = await getJSON('/metrics/hourly-sales-summary', params);
  return {
    data: json?.data || null,
    error: json?.__error,
  };
}

export async function getHourlyTrend(args) {
  const params = appendBrandKey({ start: args.start, end: args.end, aggregate: args.aggregate }, args);
  const json = await getJSON('/metrics/hourly-trend', params);
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

export async function getDailyTrend(args) {
  const params = appendBrandKey({ start: args.start, end: args.end }, args);
  const json = await getJSON('/metrics/daily-trend', params);
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

export async function getMonthlyTrend(args) {
  const params = appendBrandKey({ start: args.start, end: args.end }, args);
  const json = await getJSON('/metrics/monthly-trend', params);
  return {
    points: Array.isArray(json?.points) ? json.points : [],
    comparison: json?.comparison && Array.isArray(json?.comparison?.points)
      ? { range: json.comparison.range || null, points: json.comparison.points }
      : null,
    range: json?.range || null,
    timezone: json?.timezone || 'IST',
    error: json?.__error,
  };
}

export async function getTopProducts(args = {}) {
  const params = appendBrandKey({ start: args.start, end: args.end, limit: args.limit }, args);
  const json = await getJSON('/metrics/top-products', params);
  const products = Array.isArray(json?.products) ? json.products.map((p) => ({
    product_id: p.product_id,
    landing_page_path: p.landing_page_path || p.path || null,
    sessions: Number(p.sessions || p.total_sessions || 0),
    sessions_with_cart_additions: Number(p.sessions_with_cart_additions || p.total_atc_sessions || 0),
    add_to_cart_rate: Number(p.add_to_cart_rate || 0),
    add_to_cart_rate_pct: Number(p.add_to_cart_rate_pct || (p.add_to_cart_rate ? p.add_to_cart_rate * 100 : 0)),
  })) : [];
  return { products, error: json?.__error };
}

export async function getProductKpis(args = {}) {
  const params = appendBrandKey({ start: args.start, end: args.end, product_id: args.product_id }, args);
  const json = await getJSON('/metrics/product-kpis', params);
  const sessions = Number(json?.sessions || 0);
  const atcSessions = Number(json?.sessions_with_cart_additions || 0);
  const totalOrders = Number(json?.total_orders || 0);
  const totalSales = Number(json?.total_sales || 0);
  const addToCartRate = typeof json?.add_to_cart_rate === 'number'
    ? json.add_to_cart_rate
    : (sessions > 0 ? atcSessions / sessions : 0);
  const conversionRate = typeof json?.conversion_rate === 'number'
    ? json.conversion_rate
    : (sessions > 0 ? totalOrders / sessions : 0);

  return {
    product_id: json?.product_id || args.product_id,
    range: json?.range || { start: args.start || null, end: args.end || null },
    sessions,
    sessions_with_cart_additions: atcSessions,
    add_to_cart_rate: addToCartRate,
    add_to_cart_rate_pct: addToCartRate * 100,
    total_orders: totalOrders,
    total_sales: totalSales,
    conversion_rate: conversionRate,
    conversion_rate_pct: conversionRate * 100,
    brand_key: json?.brand_key || null,
    error: json?.__error,
  };
}

// Fetch last updated timestamp from external service using same-origin API base to avoid CORS issues
export async function getLastUpdatedPTS(arg = undefined) {
  let brandKey = '';
  if (typeof arg === 'string') {
    brandKey = normalizeBrandKey(arg);
  } else if (arg && typeof arg === 'object') {
    brandKey = normalizeBrandKey(arg.brandKey);
  }
  const search = brandKey ? `?brand_key=${encodeURIComponent(brandKey)}` : '';
  const url = `${API_BASE}/external/last-updated/pts${search}`;
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
  } catch { return { error: true }; }
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
  } catch { return { error: true }; }
}

export async function deactivateAdjustmentBucket(id, { brandKey, start, end, scope }) {
  try {
    const params = new URLSearchParams({ brand_key: brandKey });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (scope) params.set('scope', scope);
    const url = `${API_BASE}/author/adjustment-buckets/${id}?${params.toString()}`;
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) return { error: true, data: json };
    return { error: false, data: json };
  } catch { return { error: true }; }
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
  } catch { return { error: true }; }
}

// Legacy preview/apply endpoints removed from UI; keep server endpoints until deprecated.

// Author brands helper (list)
export async function listAuthorBrands() {
  return getJSON('/author/brands');
}

// ---------------- Author: Alerts admin ----------------
export async function listAlerts(params) {
  return doGet('/author/alerts', params);
}

export async function createAlert(payload) {
  return doPost('/author/alerts', payload);
}

export async function updateAlert(id, payload) {
  return doPut(`/author/alerts/${id}`, payload);
}

export async function deleteAlert(id) {
  return doDelete(`/author/alerts/${id}`);
}

export async function setAlertActive(id, isActive) {
  return doPost(`/author/alerts/${id}/status`, { is_active: isActive ? 1 : 0 });
}
