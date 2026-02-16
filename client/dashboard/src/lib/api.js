function resolveApiBase() {
  const envBase = (import.meta.env.VITE_API_BASE || '').trim();
  if (!envBase) return '/api';
  return envBase;
}

const API_BASE = resolveApiBase();

function qs(params) {
  const parts = [];
  Object.entries(params).forEach(([k, v]) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(val => {
        if (val) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
      });
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function normalizeBrandKey(src) {
  if (!src) return '';
  return src.toString().trim().toUpperCase();
}

function appendBrandKey(params, source) {
  const brand_key = normalizeBrandKey(source?.brand_key ?? source?.brandKey);
  const out = { ...params };
  if (brand_key) out.brand_key = brand_key;
  if (source?.utm_source) out.utm_source = source.utm_source;
  if (source?.utm_medium) out.utm_medium = source.utm_medium;
  if (source?.utm_campaign) out.utm_campaign = source.utm_campaign;
  if (source?.product_id) out.product_id = source.product_id;
  if (source?.sales_channel) out.sales_channel = source.sales_channel;
  if (source?.refreshKey) out.refreshKey = source.refreshKey;
  return out;
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

function authHeaders() {
  const token = window.localStorage.getItem('gateway_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshAccessToken() {
  try {
    const refreshToken = window.localStorage.getItem('gateway_refresh_token');
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refresh_token: refreshToken }), // Send in body as fallback
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
      return false;
    }
    window.localStorage.setItem('gateway_access_token', json.access_token);
    if (json.refresh_token) {
      window.localStorage.setItem('gateway_refresh_token', json.refresh_token);
    }
    return true;
  } catch (err) {
    console.error('Failed to refresh token', err);
    return false;
  }
}

let refreshPromise = null;
async function ensureFreshToken() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function fetchWithAuth(url, options = {}, retry = true) {
  const opts = { ...options, headers: { ...(options.headers || {}), ...authHeaders() } };
  const res = await fetch(url, opts);
  if (res.status === 401 && retry) {
    const refreshed = await ensureFreshToken();
    if (!refreshed) return res;
    const retryOpts = { ...options, headers: { ...(options.headers || {}), ...authHeaders() } };
    return fetch(url, retryOpts);
  }
  return res;
}

async function getJSON(path, params) {
  const url = `${API_BASE}${path}${qs(params || {})}`;
  try {
    const res = await fetchWithAuth(url);
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
    const res = await fetchWithAuth(url, { signal: options.signal });
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
    const res = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetchWithAuth(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetchWithAuth(url, { method: 'DELETE' });
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) return { error: true, status: res.status, data: json };
    window.localStorage.setItem('gateway_access_token', json.access_token);
    if (json.refresh_token) {
      window.localStorage.setItem('gateway_refresh_token', json.refresh_token);
    }
    return { error: false, data: json };
  } catch {
    return { error: true };
  }
}

export async function logout() {
  try {
    window.localStorage.removeItem('gateway_access_token');
    window.localStorage.removeItem('gateway_refresh_token');
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders(), credentials: 'include' });
  } catch {
    // ignore logout errors
  }
}

export async function me() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/me`);
    if (res.status === 401) return { authenticated: false, status: res.status };
    if (!res.ok) return { authenticated: false, status: res.status };
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

// ---- Admin user management (Access Control) -------------------------------
export async function adminListUsers() {
  return doGet('/auth/admin/users');
}

export async function adminUpsertUser(payload) {
  return doPost('/auth/admin/users', payload);
}

export async function adminDeleteUser(email) {
  return doDelete(`/auth/admin/users/${encodeURIComponent(email)}`);
}

// ---- Admin domain rules ---------------------------------------------------
export async function listDomainRules() {
  return doGet('/auth/admin/domain-rules');
}

export async function upsertDomainRule(payload) {
  return doPost('/auth/admin/domain-rules', payload);
}

export async function deleteDomainRule(domain) {
  return doDelete(`/auth/admin/domain-rules/${encodeURIComponent(domain)}`);
}

export async function getDashboardSummary(args) {
  const params = appendBrandKey({
    ...args,
    start: args.start || args.date,
    end: args.end || args.date || args.start,
  }, args);
  const json = await getJSON('/metrics/summary', params);
  return {
    metrics: json?.metrics || null,
    range: json?.range || { start: params.start || null, end: params.end || null },
    prev_range: json?.prev_range || null,
    filter_options: json?.filter_options || null,
    error: json?.__error
  };
}

// Product Types
export async function getProductTypes(args) {
  const params = appendBrandKey({ date: args.date }, args);
  const json = await getJSON('/metrics/product-types', params);
  return {
    types: Array.isArray(json?.types) ? json.types : [],
    date: json?.date || null,
    error: json?.__error
  };
}

export async function fetchProductTypes(brandKey, start, end) {
  const params = { brand_key: brandKey };
  if (start) params.start = start;
  if (end) params.end = end;
  return getJSON('/metrics/product-types', params);
}

export async function getProductConversion(args, options = {}) {
  const params = appendBrandKey({
    start: args.start,
    end: args.end,
    page: args.page,
    page_size: args.pageSize,
    sort_by: args.sortBy,
    sort_dir: args.sortDir,
    compare_start: args.compareStart,
    compare_end: args.compareEnd,
    search: args.search,
    filters: args.filters,
    // Add product_types support
    product_types: (args.productTypes || args.product_types) ? JSON.stringify(args.productTypes || args.product_types) : undefined,
  }, args);
  // Ensure product_types is serialized if needed, but getJSON/qs handles arrays automatically as multiple keys or we might need JSON.stringify if backend expects JSON string.
  // Backend expects: productTypes = typeof req.query.product_types === 'string' ? JSON.parse(...) : req.query.product_types;
  // So if we pass array here, qs() currently repeats keys: key=val1&key=val2.
  // Backend logic: productTypes = ... : req.query.product_types. If express sees multiple keys, it creates an array.
  // So standard array passing works. UNLESS backend specifically uses JSON.parse on it.
  // Backend code I wrote:
  // if (req.query.product_types) { ... JSON.parse ... : req.query.product_types }
  // So if it's an array (from qs repeating keys), JSON.parse might fail or not be needed.
  // Wait, if qs repeats keys, express body parser urlencoded extended: true makes it array?
  // Actually, axios/fetch with qs function I see in api.js:
  // qs function:
  // if (Array.isArray(v)) { v.forEach(val => parts.push(...)) }
  // So ?product_types=A&product_types=B.
  // Express req.query.product_types will be ['A', 'B'].
  // My backend code: typeof ... === 'string' ? JSON.parse : ...
  // If it's array, it falls to else, which is correct.
  // HOWEVER, implementing JSON.stringify explicitly is wider compatibility safely, like filters.
  // if (params.product_types) params.product_types = JSON.stringify(params.product_types);

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
    // Fix: Serialize filters array to JSON string to avoid [object Object] in query string
    filters: args.filters ? JSON.stringify(args.filters) : undefined,
    search: args.search,
    visible_columns: args.visible_columns ? JSON.stringify(args.visible_columns) : undefined,
    page: args.page,
    page_size: args.pageSize,
    compare_start: args.compareStart,
    compare_end: args.compareEnd,
    product_types: (args.productTypes || args.product_types) ? JSON.stringify(args.productTypes || args.product_types) : undefined,
  }, args);
  const dateSuffix = formatDateRangeSuffix(params.start, params.end);
  const fallbackName = dateSuffix ? `product_conversion_${dateSuffix}.csv` : 'product_conversion.csv';
  const url = `${resolveApiBase()}/metrics/product-conversion/export${qs(params)}`;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { ...authHeaders() }
    });
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

export async function getTrafficSourceSplit(args) {
  const params = appendBrandKey({ start: args.start, end: args.end }, args);
  const json = await getJSON('/metrics/traffic-source-split', params);
  return {
    meta: json?.meta || { sessions: 0, atc_sessions: 0 },
    meta_breakdown: json?.meta_breakdown || [],
    google: json?.google || { sessions: 0, atc_sessions: 0 },
    direct: json?.direct || { sessions: 0, atc_sessions: 0 },
    others: json?.others || { sessions: 0, atc_sessions: 0 },
    others_breakdown: json?.others_breakdown || [],
    total_sessions: Number(json?.total_sessions || 0),
    total_atc_sessions: Number(json?.total_atc_sessions || 0),
    error: json?.__error
  };
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
  const params = appendBrandKey({ start: args.start, end: args.end, aggregate: args.aggregate, compare: args.compare }, args);
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
    const res = await fetchWithAuth(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed');
    const json = await res.json();
    console.log("Last updated PTS response: ", json);
    return { raw: json["Last successful run completed at"], timezone: json.timezone, error: false };
  } catch (e) {
    console.error('Last updated fetch error', e);
    return { raw: null, timezone: null, error: true };
  }
}

// Author brands helper (list)
export async function listAuthorBrands() {
  return doGet('/author/brands');
}

// ---------------- Author: Alerts admin ----------------
export async function listAlerts(params) {
  return doGet('/alerts', params);
}

export async function createAlert(payload) {
  return doPost('/alerts', payload);
}

export async function updateAlert(id, payload) {
  return doPut(`/alerts/${id}`, payload);
}

export async function deleteAlert(id) {
  return doDelete(`/alerts/${id}`);
}

export async function setAlertActive(id, isActive) {
  return doPost(`/alerts/${id}/status`, { is_active: isActive ? 1 : 0 });
}