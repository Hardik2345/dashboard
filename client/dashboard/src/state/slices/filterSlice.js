import { createSlice } from '@reduxjs/toolkit';
import dayjs from 'dayjs';

const RANGE_KEY = 'pts_date_range_v2';
const TTL_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_TREND_METRIC = 'sales';
export const DEFAULT_PRODUCT_OPTION = { id: '', label: 'All products', detail: 'Whole store' };

function defaultRangeYesterdayToday() {
  const today = dayjs();
  return [today.toISOString(), today.toISOString()];
}

const UTM_KEY = 'pts_utm_filters_v1';

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

const filterSlice = createSlice({
  name: 'filters',
  initialState: {
    range: loadInitialRange(),
    compareMode: null,
    selectedMetric: DEFAULT_TREND_METRIC,
    productSelection: [DEFAULT_PRODUCT_OPTION],
    utm: loadInitialUtm(),
    salesChannel: [],
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
      state.compareMode = action.payload || null;
    },
    setSelectedMetric(state, action) {
      state.selectedMetric = action.payload || DEFAULT_TREND_METRIC;
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
    },
    setUtm(state, action) {
      state.utm = { ...state.utm, ...action.payload };
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
  },
});

export const { setRange, setCompareMode, setSelectedMetric, setProductSelection, setUtm, setSalesChannel } = filterSlice.actions;
export default filterSlice.reducer;
