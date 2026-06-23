import { useCallback, useEffect, useMemo, useState } from "react";

export const TARGET_CURRENCY = "INR";

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
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  if (normalizeCurrencyCode(sourceCurrency) === TARGET_CURRENCY) {
    return amount;
  }
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return amount;
  }
  return amount * rate;
}

export function formatInrAmount(value, options = {}) {
  const {
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
    notation,
  } = options;
  const cacheKey = JSON.stringify({
    maximumFractionDigits,
    minimumFractionDigits,
    notation: notation || "standard",
  });

  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: TARGET_CURRENCY,
      maximumFractionDigits,
      minimumFractionDigits,
      ...(notation ? { notation } : {}),
    });
    formatterCache.set(cacheKey, formatter);
  }

  return formatter.format(Number(value || 0));
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
  const sourceCurrency = resolveBrandCurrency(brandKey);
  const [exchangeRate, setExchangeRate] = useState(
    sourceCurrency === TARGET_CURRENCY ? 1 : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (sourceCurrency === TARGET_CURRENCY) {
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
  }, [sourceCurrency, date]);

  const convertAmount = useCallback(
    (value) => convertAmountToInr(value, exchangeRate, sourceCurrency),
    [exchangeRate, sourceCurrency],
  );

  return useMemo(
    () => ({
      sourceCurrency,
      exchangeRate,
      convertAmount,
    }),
    [sourceCurrency, exchangeRate, convertAmount],
  );
}
