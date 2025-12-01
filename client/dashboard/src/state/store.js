import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice.js';
import uiReducer from './slices/uiSlice.js';
import brandReducer from './slices/brandSlice.js';

// Central Redux store. Add new slices here as we migrate state out of components.
export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    brand: brandReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    // Allow non-serializable values in rare cases without crashing (e.g., Date/dayjs in state).
    serializableCheck: { warnAfter: 128 },
  }),
  devTools: import.meta.env.DEV,
});

export const createAppStore = () => store;
