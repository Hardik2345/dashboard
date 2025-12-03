import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  themeMode: 'dark',
  globalMessage: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setThemeMode(state, action) {
      const next = (action.payload || '').toString();
      state.themeMode = next === 'dark' ? 'dark' : 'light';
    },
    setGlobalMessage(state, action) {
      state.globalMessage = action.payload || null;
    },
    clearGlobalMessage(state) {
      state.globalMessage = null;
    },
  },
});

export const { setThemeMode, setGlobalMessage, clearGlobalMessage } = uiSlice.actions;
export default uiSlice.reducer;
