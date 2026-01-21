import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getProductConversion } from '../../lib/api.js';

const today = new Date().toISOString().slice(0, 10);

export const fetchProductConversion = createAsyncThunk(
  'productConversion/fetch',
  async (params = {}, { getState, rejectWithValue, signal }) => {
    const state = getState().productConversion || {};
    const start = params.start || state.start || today;
    const end = params.end || state.end || today;
    const page = params.page || state.page || 1;
    const pageSize = params.pageSize || state.pageSize || 10;
    const sortBy = params.sortBy || state.sortBy || 'sessions';
    const sortDir = params.sortDir || state.sortDir || 'desc';
    const compareMode = params.compareMode ?? state.compareMode ?? false;
    const compareStart = params.compareStart || state.compareStart || null;
    const compareEnd = params.compareEnd || state.compareEnd || null;

    let filters = params.filters || state.filters || [];
    const search = params.search !== undefined ? params.search : (state.search || '');
    let productTypes = params.productTypes || state.productTypes || [];
    if (!Array.isArray(productTypes)) productTypes = [];

    // Ensure it is always an array
    if (!Array.isArray(filters)) filters = [];

    const apiParams = {
      start, end, page, pageSize, sortBy, sortDir, brand_key: params.brand_key,
      filters: JSON.stringify(filters),
      search,
      productTypes,
    };

    if (compareMode && compareStart && compareEnd) {
      apiParams.compareStart = compareStart;
      apiParams.compareEnd = compareEnd;
    }

    const resp = await getProductConversion(apiParams, { signal });
    if (resp.error) {
      return rejectWithValue('Failed to fetch product conversion');
    }
    return {
      rows: resp.rows,
      total_count: resp.total_count,
      page: resp.page || page,
      pageSize: resp.page_size || pageSize,
      sortBy,
      sortDir,
      start,
      end,
      compareMode,
      compareStart,
      compareEnd,

      filters,
      search,
      productTypes
    };
  }
);

// Helper to save state
const saveState = (state) => {
  try {
    const toSave = {
      start: state.start,
      end: state.end,
      compareMode: state.compareMode,
      compareStart: state.compareStart,
      compareEnd: state.compareEnd,
      pageSize: state.pageSize,
      filters: state.filters,
      productTypes: state.productTypes,
    };
    localStorage.setItem('productConversionState', JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save state', e);
  }
};

// Helper to load state
const loadState = () => {
  try {
    const serialized = localStorage.getItem('productConversionState');
    if (serialized === null) return {};
    return JSON.parse(serialized);
  } catch (e) {
    return {};
  }
};

const saved = loadState();

const initialState = {
  start: saved.start || today,
  end: saved.end || today,
  page: 1,
  pageSize: saved.pageSize || 10,
  sortBy: 'sessions',
  sortDir: 'desc',
  rows: [],
  totalCount: 0,
  status: 'idle',
  error: null,
  compareMode: saved.compareMode ?? false,
  compareStart: saved.compareStart || null,
  compareEnd: saved.compareEnd || null,

  filters: Array.isArray(saved.filters) ? saved.filters : [],
  productTypes: Array.isArray(saved.productTypes) ? saved.productTypes : [],
  search: '',
};

const productConversionSlice = createSlice({
  name: 'productConversion',
  initialState,
  reducers: {
    setDateRange(state, action) {
      state.start = action.payload?.start || today;
      state.end = action.payload?.end || today;
      state.page = 1;
      saveState(state);
    },
    setCompareMode(state, action) {
      state.compareMode = !!action.payload;
      saveState(state);
    },
    setCompareDateRange(state, action) {
      state.compareStart = action.payload?.start || null;
      state.compareEnd = action.payload?.end || null;
      saveState(state);
    },
    addFilter(state, action) {
      // payload: { field, operator, value }
      if (action.payload && action.payload.field) {
        state.filters.push(action.payload);
        state.page = 1;
        saveState(state);
      }
    },
    removeFilter(state, action) {
      // payload: index
      state.filters.splice(action.payload, 1);
      state.page = 1;
      saveState(state);
    },
    clearFilters(state) {
      state.filters = [];
      state.page = 1;
      saveState(state);
    },
    setSearch(state, action) {
      state.search = action.payload || '';
      state.page = 1;
    },
    // Keep setFilter for backward compatibility or reset logic if needed, but primary is add/remove
    setFilter(state, action) {
      // If used, treat as setting a single filter (clearing others)
      state.filters = [action.payload];
      state.page = 1;
      saveState(state);
    },
    setProductTypes(state, action) {
      state.productTypes = Array.isArray(action.payload) ? action.payload : [];
      state.page = 1;
      saveState(state);
    },
    setPage(state, action) {
      state.page = action.payload || 1;
    },
    setPageSize(state, action) {
      state.pageSize = action.payload || 10;
      state.page = 1;
      saveState(state);
    },
    setSort(state, action) {
      const { sortBy, sortDir } = action.payload || {};
      if (sortBy) state.sortBy = sortBy;
      if (sortDir) state.sortDir = sortDir;
      state.page = 1;
    },
    resetProductConversion() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductConversion.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProductConversion.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
        state.rows = action.payload.rows || [];
        state.totalCount = action.payload.total_count || 0;
        state.page = action.payload.page || 1;
        state.pageSize = action.payload.pageSize || state.pageSize;
        state.sortBy = action.payload.sortBy || state.sortBy;
        state.sortDir = action.payload.sortDir || state.sortDir;
        state.start = action.payload.start || state.start;
        state.end = action.payload.end || state.end;
        state.compareMode = action.payload.compareMode;
        state.compareStart = action.payload.compareStart;
        state.compareEnd = action.payload.compareEnd;
        state.compareStart = action.payload.compareStart;
        state.compareEnd = action.payload.compareEnd;
        state.filters = action.payload.filters || [];
        state.search = action.payload.search || '';
        state.productTypes = action.payload.productTypes || [];
      })
      .addCase(fetchProductConversion.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch product conversion';
      });
  },
});

export const { setDateRange, setCompareMode, setCompareDateRange, setPage, setPageSize, setSort, resetProductConversion, setFilter, addFilter, removeFilter, clearFilters, setSearch, setProductTypes } = productConversionSlice.actions;
export default productConversionSlice.reducer;


