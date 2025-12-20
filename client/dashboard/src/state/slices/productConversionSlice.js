import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getProductConversion } from '../../lib/api.js';

const today = new Date().toISOString().slice(0, 10);

export const fetchProductConversion = createAsyncThunk(
  'productConversion/fetch',
  async (params = {}, { getState, rejectWithValue }) => {
    const state = getState().productConversion || {};
    const start = params.start || state.start || today;
    const end = params.end || state.end || today;
    const page = params.page || state.page || 1;
    const pageSize = params.pageSize || state.pageSize || 10;
    const sortBy = params.sortBy || state.sortBy || 'sessions';
    const sortDir = params.sortDir || state.sortDir || 'desc';

    const resp = await getProductConversion({ start, end, page, pageSize, sortBy, sortDir, brand_key: params.brand_key });
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
    };
  }
);

const initialState = {
  start: today,
  end: today,
  page: 1,
  pageSize: 10,
  sortBy: 'sessions',
  sortDir: 'desc',
  rows: [],
  totalCount: 0,
  status: 'idle',
  error: null,
};

const productConversionSlice = createSlice({
  name: 'productConversion',
  initialState,
  reducers: {
    setDateRange(state, action) {
      state.start = action.payload?.start || today;
      state.end = action.payload?.end || today;
      state.page = 1;
    },
    setPage(state, action) {
      state.page = action.payload || 1;
    },
    setPageSize(state, action) {
      state.pageSize = action.payload || 10;
      state.page = 1;
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
      })
      .addCase(fetchProductConversion.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch product conversion';
      });
  },
});

export const { setDateRange, setPage, setPageSize, setSort, resetProductConversion } = productConversionSlice.actions;
export default productConversionSlice.reducer;
