import { createSlice } from '@reduxjs/toolkit';
import dayjs from 'dayjs';

const RANGE_KEY = 'pts_date_range_v2';
const TTL_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_TREND_METRIC = 'sales';
export const DEFAULT_PRODUCT_OPTION = { id: '', label: 'All products', detail: 'Whole store' };

function defaultRangeYesterdayToday() {
  const today = dayjs();
  return [today, today];
}

function loadInitialRange() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RANGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.start && parsed.end && parsed.savedAt) {
        if (Date.now() - parsed.savedAt < TTL_MS) {
          return [dayjs(parsed.start), dayjs(parsed.end)];
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem(RANGE_KEY);
      }
    }
  } catch {
    // ignore and fall back
  }
  return defaultRangeYesterdayToday();
}

const filterSlice = createSlice({
  name: 'filters',
  initialState: {
    range: loadInitialRange(),
    selectedMetric: DEFAULT_TREND_METRIC,
    productSelection: DEFAULT_PRODUCT_OPTION,
  },
  reducers: {
    setRange(state, action) {
      const next = Array.isArray(action.payload) ? action.payload : [];
      const [start, end] = next;
      state.range = [start, end];
    },
    setSelectedMetric(state, action) {
      state.selectedMetric = action.payload || DEFAULT_TREND_METRIC;
    },
    setProductSelection(state, action) {
      const val = action.payload;
      if (val && typeof val === 'object') {
        state.productSelection = val;
      } else {
        state.productSelection = DEFAULT_PRODUCT_OPTION;
      }
    },
  },
});

export const { setRange, setSelectedMetric, setProductSelection } = filterSlice.actions;
export default filterSlice.reducer;
