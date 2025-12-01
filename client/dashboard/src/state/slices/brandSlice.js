import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Optional: if you want to load default from localStorage
const initialBrand = localStorage.getItem("author_active_brand_v1") || "TMC";

const initialState = {
  brand: initialBrand,
};

// Thunk: updates redux + localStorage
export const setBrand = createAsyncThunk(
  "brand/setBrand",
  async (brandName) => {
    localStorage.setItem("author_active_brand_v1", brandName);
    return brandName;
  }
);

const brandSlice = createSlice({
  name: "brand",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(setBrand.fulfilled, (state, action) => {
      state.brand = action.payload;
    });
  },
});

export default brandSlice.reducer;
