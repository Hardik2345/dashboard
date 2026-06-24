import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const TARGET_CURRENCY = "INR";
export const CURRENCY_DISPLAY_MODES = {
  STORE: "store",
  INR: "inr",
};

const CurrencyDisplayContext = createContext({
  mode: CURRENCY_DISPLAY_MODES.INR,
  setMode: () => {},
  canToggle: false,
});

const DEFAULT_BRAND_CURRENCY_MAP = {
  AJMAL_BH: "BHD",
  AJMAL_KSA: "SAR",
};

const BRAND_SUFFIX_CURRENCY_MAP = {
  BH: "BHD",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  KW: "KWD",
  OM: "OMR",
  US: "USD",
  UK: "GBP",
  EU: "EUR",
};

const formatterCache = new Map();
const rateCache = new Map();

function normalizeCurrencyCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDisplayMode(value) {
  return value === CURRENCY_DISPLAY_MODES.STORE
    ? CURRENCY_DISPLAY_MODES.STORE
    : CURRENCY_DISPLAY_MODES.INR;
}

function normalizeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function readEnvBrandCurrencyMap() {
  const raw = String(import.meta.env.VITE_BRAND_CURRENCY_MAP || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([brandKey, currency]) => [
        normalizeCurrencyCode(brandKey),
        normalizeCurrencyCode(currency),
      ]),
    );
  } catch {
    return {};
  }
}

const ENV_BRAND_CURRENCY_MAP = readEnvBrandCurrencyMap();

export function resolveBrandCurrency(brandKey) {
  const normalizedBrandKey = normalizeCurrencyCode(brandKey);
  if (!normalizedBrandKey) return TARGET_CURRENCY;

  const explicit =
    ENV_BRAND_CURRENCY_MAP[normalizedBrandKey] ||
    DEFAULT_BRAND_CURRENCY_MAP[normalizedBrandKey];
  if (explicit) return explicit;

  const parts = normalizedBrandKey.split("_");
  const suffix = parts[parts.length - 1];
  return BRAND_SUFFIX_CURRENCY_MAP[suffix] || TARGET_CURRENCY;
}

export function convertAmountToInr(value, exchangeRate, sourceCurrency) {
  const amount = normalizeAmount(value);
  if (normalizeCurrencyCode(sourceCurrency) === TARGET_CURRENCY) {
    return amount;
  }
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return amount;
  }
  return amount * rate;
}

function formatCurrencyAmount(value, currencyCode, options = {}) {
  const {
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
    notation,
  } = options;
  const cacheKey = JSON.stringify({
    currencyCode,
    maximumFractionDigits,
    minimumFractionDigits,
    notation: notation || "standard",
  });

  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    const normalizedCurrency =
      normalizeCurrencyCode(currencyCode) || TARGET_CURRENCY;
    formatter = new Intl.NumberFormat(
      normalizedCurrency === TARGET_CURRENCY ? "en-IN" : undefined,
      {
        style: "currency",
        currency: normalizedCurrency,
        maximumFractionDigits,
        minimumFractionDigits,
        ...(notation ? { notation } : {}),
      },
    );
    formatterCache.set(cacheKey, formatter);
  }

  return formatter.format(normalizeAmount(value));
}

export function formatInrAmount(value, options = {}) {
  return formatCurrencyAmount(value, TARGET_CURRENCY, options);
}

async function fetchExchangeRate(sourceCurrency, date) {
  const normalizedSource = normalizeCurrencyCode(sourceCurrency);
  if (!normalizedSource || normalizedSource === TARGET_CURRENCY) return 1;

  const normalizedDate = String(date || "").trim();
  const cacheKey = `${normalizedSource}:${TARGET_CURRENCY}:${normalizedDate || "latest"}`;

  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey);
  }

  const params = new URLSearchParams();
  if (normalizedDate) {
    params.set("date", normalizedDate);
  }

  const promise = fetch(
    `https://api.frankfurter.dev/v2/rate/${normalizedSource}/${TARGET_CURRENCY}?${params.toString()}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`FX lookup failed with ${response.status}`);
      }
      const json = await response.json();
      const rate = Number(json?.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("FX lookup returned an invalid rate");
      }
      return rate;
    })
    .catch((error) => {
      rateCache.delete(cacheKey);
      throw error;
    });

  rateCache.set(cacheKey, promise);
  return promise;
}

export function useInrCurrency(brandKey, date) {
  const { mode } = useContext(CurrencyDisplayContext);
  const displayMode = normalizeDisplayMode(mode);
  const sourceCurrency = resolveBrandCurrency(brandKey);
  const displayCurrency =
    displayMode === CURRENCY_DISPLAY_MODES.STORE
      ? sourceCurrency || TARGET_CURRENCY
      : TARGET_CURRENCY;
  const [exchangeRate, setExchangeRate] = useState(
    displayMode === CURRENCY_DISPLAY_MODES.STORE ||
      sourceCurrency === TARGET_CURRENCY
      ? 1
      : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (
      displayMode === CURRENCY_DISPLAY_MODES.STORE ||
      sourceCurrency === TARGET_CURRENCY
    ) {
      setExchangeRate(1);
      return () => {
        cancelled = true;
      };
    }

    fetchExchangeRate(sourceCurrency, date)
      .then((rate) => {
        if (!cancelled) {
          setExchangeRate(rate);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExchangeRate(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [displayMode, sourceCurrency, date]);

  const convertAmount = useCallback(
    (value) =>
      displayMode === CURRENCY_DISPLAY_MODES.STORE
        ? normalizeAmount(value)
        : convertAmountToInr(value, exchangeRate, sourceCurrency),
    [displayMode, exchangeRate, sourceCurrency],
  );

  const formatAmount = useCallback(
    (value, options = {}) =>
      formatCurrencyAmount(convertAmount(value), displayCurrency, options),
    [convertAmount, displayCurrency],
  );
  const formatConvertedAmount = useCallback(
    (value, options = {}) =>
      formatCurrencyAmount(value, displayCurrency, options),
    [displayCurrency],
  );

  return useMemo(
    () => ({
      mode: displayMode,
      sourceCurrency,
      displayCurrency,
      exchangeRate,
      convertAmount,
      formatAmount,
      formatConvertedAmount,
    }),
    [
      displayMode,
      sourceCurrency,
      displayCurrency,
      exchangeRate,
      convertAmount,
      formatAmount,
      formatConvertedAmount,
    ],
  );
}

export function CurrencyDisplayProvider({
  mode = CURRENCY_DISPLAY_MODES.INR,
  setMode,
  canToggle = false,
  children,
}) {
  const value = useMemo(
    () => ({
      mode: normalizeDisplayMode(mode),
      setMode: typeof setMode === "function" ? setMode : () => {},
      canToggle: Boolean(canToggle),
    }),
    [mode, setMode, canToggle],
  );

  return createElement(CurrencyDisplayContext.Provider, { value }, children);
}

export function useCurrencyDisplayMode() {
  return useContext(CurrencyDisplayContext);
}
