import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { login, logout, me } from '../../lib/api.js';

function normalizeUser(user) {
  if (!user) return null;
  const memberships = Array.isArray(user.brand_memberships) ? user.brand_memberships : [];
  const hasAuthorRole = (user.role || '').toLowerCase() === 'author';
  return {
    ...user,
    isAuthor: hasAuthorRole,
    brandKey: user.primary_brand_id || memberships[0]?.brand_id || '',
  };
}

export const fetchCurrentUser = createAsyncThunk('auth/fetchCurrentUser', async (_, { rejectWithValue }) => {
  const r = await me();
  if (!r.authenticated) return { user: null };
  if (!r.user) return rejectWithValue('Missing user payload');
  return { user: normalizeUser(r.user), expiresAt: r.expiresAt };
});

export const loginUser = createAsyncThunk('auth/loginUser', async ({ email, password }, { rejectWithValue }) => {
  const r = await login(email, password);
  if (r.error) {
    const msg = r.data?.error || 'Login failed';
    return rejectWithValue(msg);
  }
  return { user: normalizeUser(r.data?.user || null) };
});

export const logoutUser = createAsyncThunk('auth/logoutUser', async () => {
  await logout();
  return { user: null };
});

const initialState = {
  user: null,
  expiresAt: null,
  initialized: false,
  meStatus: 'idle',
  loginStatus: 'idle',
  loginError: null,
  logoutStatus: 'idle',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload || null;
    },
    resetAuthState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.meStatus = 'loading';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.meStatus = 'succeeded';
        state.initialized = true;
        state.user = action.payload?.user || null;
        state.expiresAt = action.payload?.expiresAt || null;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.meStatus = 'failed';
        state.initialized = true;
        state.user = null;
      })
      .addCase(loginUser.pending, (state) => {
        state.loginStatus = 'loading';
        state.loginError = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loginStatus = 'succeeded';
        state.user = action.payload?.user || null;
        state.loginError = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loginStatus = 'failed';
        state.loginError = action.payload || 'Login failed';
      })
      .addCase(logoutUser.pending, (state) => {
        state.logoutStatus = 'loading';
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.logoutStatus = 'succeeded';
        state.user = null;
        state.loginStatus = 'idle';
        state.loginError = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.logoutStatus = 'failed';
        state.user = null;
      });
  },
});

export const { setUser, resetAuthState } = authSlice.actions;
export default authSlice.reducer;
