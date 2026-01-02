import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice.js';
import brandReducer from './slices/brandSlice.js';
import productConversionReducer from './slices/productConversionSlice.js';
import filterReducer from './slices/filterSlice.js';

// Central Redux store. Add new slices here as we migrate state out of components.
export const store = configureStore({
  reducer: {
    auth: authReducer,
    brand: brandReducer,
    productConversion: productConversionReducer,
    filters: filterReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    // Allow non-serializable values in rare cases without crashing (e.g., Date/dayjs in state).
    serializableCheck: { warnAfter: 128 },
  }),
  devTools: import.meta.env.DEV,
});

export const createAppStore = () => store;
