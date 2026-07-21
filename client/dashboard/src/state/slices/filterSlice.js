import { createSlice } from '@reduxjs/toolkit';
import dayjs from 'dayjs';
import {
  DEFAULT_TREND_METRIC,
  sanitizeTrendMetricSelection,
} from '../../lib/trendSelection.js';

const RANGE_KEY = 'pts_date_range_v2';
const TTL_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_PRODUCT_OPTION = { id: '', label: 'All products', detail: 'Whole store' };

function defaultRangeYesterdayToday() {
  const today = dayjs();
  return [today.toISOString(), today.toISOString()];
}

const UTM_KEY = 'pts_utm_filters_v1';
const DISCOUNT_KEY = 'pts_discount_filter_v1';

function loadInitialRange() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RANGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.start && parsed.end && parsed.savedAt) {
        if (Date.now() - parsed.savedAt < TTL_MS) {
          return [parsed.start, parsed.end];
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem(RANGE_KEY);
      }
    }
  } catch {
    // ignore and fall back
  }
  return defaultRangeYesterdayToday();
}

function loadInitialUtm() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UTM_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    }
  } catch {
    // ignore
  }
  return { source: [], medium: [], campaign: [], term: [], content: [] };
}

function loadInitialDiscountCode() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DISCOUNT_KEY) : null;
    return raw ? JSON.parse(raw) || '' : '';
  } catch {
    return '';
  }
}

function hasSelectedProduct(selection) {
  const items = Array.isArray(selection) ? selection : selection ? [selection] : [];
  return items.some((p) => p?.id);
}

function hasActiveUtm(utm = {}) {
  return ['source', 'medium', 'campaign', 'term', 'content'].some((key) => {
    const value = utm?.[key];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  });
}

const filterSlice = createSlice({
  name: 'filters',
  initialState: {
    range: loadInitialRange(),
    compareMode: false,
    compareDateRange: [null, null],
    selectedMetrics: [],
    activeMetric: DEFAULT_TREND_METRIC,
    productSelection: [DEFAULT_PRODUCT_OPTION],
    utm: loadInitialUtm(),
    discountCode: loadInitialDiscountCode(),
    salesChannel: [],
    deviceType: [],
    city: [],
  },
  reducers: {
    setRange(state, action) {
      const next = Array.isArray(action.payload) ? action.payload : [];
      const [start, end] = next;
      const toIso = (v) => {
        const d = dayjs(v);
        return d.isValid() ? d.toISOString() : null;
      };
      state.range = [toIso(start), toIso(end)];
    },
    setCompareMode(state, action) {
      state.compareMode = !!action.payload;
      if (!action.payload) {
        state.compareDateRange = [null, null];
      }
    },
    setCompareDateRange(state, action) {
      const next = Array.isArray(action.payload) ? action.payload : [];
      const [start, end] = next;
      const toIso = (v) => {
        if (!v) return null;
        const d = dayjs(v);
        return d.isValid() ? d.toISOString() : null;
      };
      state.compareDateRange = [toIso(start), toIso(end)];
    },
    setTrendMetricSelection(state, action) {
      const next = sanitizeTrendMetricSelection(
        action.payload?.selectedMetrics,
        action.payload?.activeMetric,
      );
      state.selectedMetrics = next.selectedMetrics;
      state.activeMetric = next.activeMetric;
    },
    setProductSelection(state, action) {
      // Support array or single object, normalize to array
      const payload = action.payload;
      if (Array.isArray(payload)) {
        state.productSelection = payload.length > 0 ? payload : [DEFAULT_PRODUCT_OPTION];
      } else if (payload) {
        state.productSelection = [payload];
      } else {
        state.productSelection = [DEFAULT_PRODUCT_OPTION];
      }
      // Ensure we don't have duplicates
      const unique = new Map(state.productSelection.map(p => [p.id, p]));
      state.productSelection = Array.from(unique.values());
      // If any real product is selected, drop the synthetic "All products" option.
      if (state.productSelection.some((p) => p?.id)) {
        state.productSelection = state.productSelection.filter((p) => p?.id);
      }
      if (state.productSelection.length === 0) {
        state.productSelection = [DEFAULT_PRODUCT_OPTION];
      }
      if (hasSelectedProduct(state.productSelection)) {
        state.utm = { source: [], medium: [], campaign: [], term: [], content: [] };
      }
    },
    setUtm(state, action) {
      const nextUtm = { ...state.utm, ...action.payload };
      state.utm = nextUtm;
      if (hasActiveUtm(nextUtm)) {
        state.productSelection = [DEFAULT_PRODUCT_OPTION];
      }
    },
    setSalesChannel(state, action) {
      // Support array or string
      const payload = action.payload;
      if (Array.isArray(payload)) {
        state.salesChannel = payload;
      } else if (typeof payload === 'string') {
        // If it's a comma separated string, split it? Or just treat as single?
        // Existing behavior was single string. Let's wrap in array if it's a single non-empty string
        state.salesChannel = payload ? [payload] : [];
      } else {
        state.salesChannel = [];
      }
    },
    setDeviceType(state, action) {
      const payload = action.payload;
      if (Array.isArray(payload)) {
        state.deviceType = payload;
      } else if (typeof payload === 'string') {
        state.deviceType = payload ? [payload] : [];
      } else {
        state.deviceType = [];
      }
    },
    setDiscountCode(state, action) {
      state.discountCode = (action.payload || '').toString();
    },
    setCity(state, action) {
      const payload = action.payload;
      if (Array.isArray(payload)) {
        state.city = payload;
      } else if (typeof payload === 'string') {
        state.city = payload ? [payload] : [];
      } else {
        state.city = [];
      }
    },
  },
});

export const { setRange, setCompareMode, setCompareDateRange, setTrendMetricSelection, setProductSelection, setUtm, setSalesChannel, setDeviceType, setDiscountCode, setCity } = filterSlice.actions;
export default filterSlice.reducer;
