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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('API error', path, e);
    return { __error: true };
  }
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
