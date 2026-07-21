const { QueryTypes } = require("sequelize");
const { shiftDays } = require("../shared/utils/date");
const { buildWhereClause } = require("../shared/utils/sql");
const { appendUtmWhere } = require("../shared/utils/filters");
const {
  resolveUtmAggregateSource,
  resolveDiscountAggregateSource,
  appendDiscountWhere,
} = require("./metricsAggregateService");
const {
  pad2,
  DEFAULT_TIMEZONE,
  getTimezoneContext,
  normalizeTimezone,
  formatUtcDate,
  resolveCompareRange,
  buildCompletedHourOrderCutoffTime,
} = require("./metricsFoundation");

const PAYMENT_TYPE_CASE_SQL = `
  CASE
    WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
    WHEN (payment_gateway_names IS NULL 
    OR payment_gateway_names = '' 
    OR payment_gateway_names LIKE '%Cash on Delivery (COD)%' 
    OR payment_gateway_names LIKE '%cash_on_delivery%')
    AND (payment_gateway_names NOT LIKE '%Gokwik PPCOD%' OR payment_gateway_names IS NULL)
    THEN 'COD'
    ELSE 'Prepaid'
  END
`;

function parseHourLte(hourLteRaw) {
  const hasHourLte =
    hourLteRaw !== undefined &&
    hourLteRaw !== null &&
    `${hourLteRaw}`.trim() !== "";
  if (!hasHourLte) {
    return { hasHourLte: false, hourLte: null };
  }
  const hourLte = Number.parseInt(`${hourLteRaw}`.trim(), 10);
  if (!Number.isInteger(hourLte) || hourLte < 0 || hourLte > 23) {
    const error = new Error(
      "Invalid hour_lte. Expected an integer between 0 and 23.",
    );
    error.status = 400;
    throw error;
  }
  return { hasHourLte: true, hourLte };
}

function buildClosedOpenTimestampRange(start, end, hourLte = null) {
  const effectiveStart = start || end;
  const effectiveEnd = end || start;
  if (!effectiveStart || !effectiveEnd) {
    return null;
  }
  const startTs = `${effectiveStart} 00:00:00`;
  const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
  if (Number.isInteger(hourLte)) {
    endTsExclusive.setUTCHours(hourLte + 1, 0, 0, 0);
  } else {
    endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
  }
  return {
    effectiveStart,
    effectiveEnd,
    startTs,
    endTs: endTsExclusive.toISOString().slice(0, 19).replace("T", " "),
  };
}

function hasCityFilter(filters = {}) {
  return Array.isArray(filters.city) ? filters.city.length > 0 : !!filters.city;
}

function appendCityOrderWhere(whereSql, replacements, city) {
  const cities = Array.isArray(city) ? city.filter(Boolean) : city ? [city] : [];
  if (cities.length === 0) return whereSql;
  const normalizedExpr =
    "LOWER(TRIM(COALESCE(NULLIF(shipping_city, ''), NULLIF(billing_city, ''))))";
  if (cities.length === 1) {
    replacements.push(cities[0].toString().trim().toLowerCase());
    return `${whereSql} AND ${normalizedExpr} = ?`;
  }
  replacements.push(...cities.map((value) => value.toString().trim().toLowerCase()));
  return `${whereSql} AND ${normalizedExpr} IN (${cities.map(() => "?").join(", ")})`;
}

function computeOrderSplitPayload({
  start,
  end,
  timezone = DEFAULT_TIMEZONE,
  hourLte = null,
  productId = "",
  codOrders = 0,
  prepaidOrders = 0,
  partiallyPaidOrders = 0,
  includeSql = false,
  sql = "",
}) {
  const total = codOrders + prepaidOrders + partiallyPaidOrders;
  return {
    metric: "ORDER_SPLIT",
    timezone: normalizeTimezone(timezone),
    range: {
      start: start || null,
      end: end || null,
      hour_lte: Number.isInteger(hourLte) ? hourLte : null,
      ...(productId ? { product_id: productId } : {}),
    },
    cod_orders: codOrders,
    prepaid_orders: prepaidOrders,
    partially_paid_orders: partiallyPaidOrders,
    total_orders_from_split: total,
    cod_percent: total > 0 ? (codOrders / total) * 100 : 0,
    prepaid_percent: total > 0 ? (prepaidOrders / total) * 100 : 0,
    partially_paid_percent:
      total > 0 ? (partiallyPaidOrders / total) * 100 : 0,
    sql_used: includeSql ? sql : undefined,
  };
}

function buildTimezoneBuckets(days, timezone = DEFAULT_TIMEZONE, now = new Date()) {
  const buckets = [];
  const resolvedTimezone = normalizeTimezone(timezone);
  const nowLocal = getTimezoneContext(now, resolvedTimezone).nowLocal;
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(nowLocal.getTime());
    day.setUTCDate(day.getUTCDate() - offset);
    const date = formatUtcDate(day);
    const maxHour = offset === 0 ? day.getUTCHours() : 23;
    for (let hour = 0; hour <= maxHour; hour += 1) {
      buckets.push({ date, hour });
    }
  }
  return buckets;
}

const buildIstBuckets = (days, now = new Date()) => buildTimezoneBuckets(days, DEFAULT_TIMEZONE, now);

function shiftBucketDays(buckets, deltaDays) {
  return buckets.map((bucket) => ({
    date: shiftDays(bucket.date, deltaDays),
    hour: bucket.hour,
  }));
}

function getBucketSpan(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null;
  }
  const dates = buckets.map((bucket) => bucket.date).sort();
  return {
    start: dates[0],
    end: dates[dates.length - 1],
  };
}

function normalizeProductIds(productId) {
  if (Array.isArray(productId)) {
    return productId
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean);
  }
  const normalized = productId == null ? "" : String(productId).trim();
  return normalized ? [normalized] : [];
}

async function fetchHourlySalesRange(conn, start, end) {
  if (!start || !end) return [];
  return conn.query(
    `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        total_sales
      FROM hour_wise_sales
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC, hour ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [start, end],
    },
  );
}

function buildMetricsReportService() {
  async function getTrafficSourceSplit({
    conn,
    start,
    end,
    compareStart = null,
    compareEnd = null,
    productId = "",
  }) {
    const previousRange = resolveCompareRange(
      start,
      end,
      compareStart,
      compareEnd,
    );
    const productIds = normalizeProductIds(productId);
    const useProductScopedSource = productIds.length > 0;
    const dateReplacements = [
      start,
      end,
      previousRange?.start || start,
      previousRange?.end || end,
    ];

    let sql = `
      SELECT date, utm_source
      FROM ${useProductScopedSource ? "product_traffic_split" : "overall_traffic_split"}
      WHERE ((date >= ? AND date <= ?) OR (date >= ? AND date <= ?))
    `;
    const replacements = [...dateReplacements];

    if (useProductScopedSource) {
      if (productIds.length === 1) {
        sql += ` AND product_id = ?`;
        replacements.push(productIds[0]);
      } else {
        sql += ` AND product_id IN (?)`;
        replacements.push(productIds);
      }
    }

    const rows = await conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements,
    });
    return {
      rows,
      prev_range: previousRange,
    };
  }

  async function getPaymentSalesSplit({
    conn,
    start,
    end,
    hourLte = null,
    productId = "",
    filters = {},
    includeSql = false,
    timezone = DEFAULT_TIMEZONE,
  }) {
    const resolvedTimezone = normalizeTimezone(timezone);
    const effectiveStart = start || end;
    const effectiveEnd = end || start;
    if (!effectiveStart || !effectiveEnd) {
      return {
        metric: "PAYMENT_SPLIT_SALES",
        timezone: resolvedTimezone,
        range: { start: null, end: null },
        cod_sales: 0,
        prepaid_sales: 0,
        partial_sales: 0,
        total_sales_from_split: 0,
        cod_percent: 0,
        prepaid_percent: 0,
        partial_percent: 0,
      };
    }

    const isSingleDay = effectiveStart === effectiveEnd;
    const useHourlyCutoff = Number.isInteger(hourLte);

    const discountSource = resolveDiscountAggregateSource(
      filters,
      useHourlyCutoff ? "hourly" : "daily",
    );
    if (discountSource && !productId) {
      let sql = `
        SELECT
          payment_mode,
          COALESCE(SUM(gross_revenue), 0) AS sales
        FROM ${useHourlyCutoff ? "dashboard_discount_payment_hourly" : "dashboard_discount_payment_daily"}
        WHERE date >= ? AND date <= ?
      `;
      const replacements = [effectiveStart, effectiveEnd];
      if (useHourlyCutoff) {
        sql += ` AND hour <= ?`;
        replacements.push(hourLte);
      }
      sql = appendDiscountWhere(sql, replacements, filters);
      sql += ` GROUP BY payment_mode`;

      const rows = await conn.query(sql, {
        type: QueryTypes.SELECT,
        replacements,
      });

      let codSales = 0;
      let prepaidSales = 0;
      let partialSales = 0;
      for (const row of rows) {
        if (row.payment_mode === "cod") codSales = Number(row.sales || 0);
        if (row.payment_mode === "prepaid") prepaidSales = Number(row.sales || 0);
        if (row.payment_mode === "partially_paid") partialSales = Number(row.sales || 0);
      }
      const total = codSales + prepaidSales + partialSales;
      return {
        metric: "PAYMENT_SPLIT_SALES",
        timezone: resolvedTimezone,
        range: {
          start: effectiveStart,
          end: effectiveEnd,
          hour_lte: useHourlyCutoff ? hourLte : null,
        },
        cod_sales: codSales,
        prepaid_sales: prepaidSales,
        partial_sales: partialSales,
        total_sales_from_split: total,
        cod_percent: total > 0 ? (codSales / total) * 100 : 0,
        prepaid_percent: total > 0 ? (prepaidSales / total) * 100 : 0,
        partial_percent: total > 0 ? (partialSales / total) * 100 : 0,
        sql_used: includeSql ? sql : undefined,
      };
    }

    let whereSql = isSingleDay
      ? `WHERE created_date = ?`
      : `WHERE created_date >= ? AND created_date <= ?`;
    const replacements = isSingleDay
      ? [effectiveStart]
      : [effectiveStart, effectiveEnd];

    if (productId || hasCityFilter(filters)) {
      whereSql += ` AND product_id = ?`;
      if (productId) {
        replacements.push(productId);
      } else {
        whereSql = whereSql.replace(" AND product_id = ?", "");
      }
    }
    if (useHourlyCutoff) {
      whereSql += ` AND created_time < ?`;
      replacements.push(buildCompletedHourOrderCutoffTime(hourLte));
    }
    whereSql = appendUtmWhere(whereSql, replacements, filters, true);
    whereSql = appendCityOrderWhere(whereSql, replacements, filters.city);

    const sql = `
      SELECT payment_type, SUM(max_price) AS sales
      FROM (
        SELECT 
          ${PAYMENT_TYPE_CASE_SQL} AS payment_type,
          order_name,
          MAX(total_price) AS max_price
        FROM shopify_orders
        ${whereSql}
        GROUP BY payment_gateway_names, order_name
      ) sub
      GROUP BY payment_type
    `;

    const rows = await conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements,
    });

    let codSales = 0;
    let prepaidSales = 0;
    let partialSales = 0;
    for (const row of rows) {
      if (row.payment_type === "COD") {
        codSales = Number(row.sales || 0);
      } else if (row.payment_type === "Prepaid") {
        prepaidSales = Number(row.sales || 0);
      } else if (row.payment_type === "Partial") {
        partialSales = Number(row.sales || 0);
      }
    }

    const total = codSales + prepaidSales + partialSales;
    return {
      metric: "PAYMENT_SPLIT_SALES",
      timezone: resolvedTimezone,
      range: {
        start: effectiveStart,
        end: effectiveEnd,
        hour_lte: null,
      },
      cod_sales: codSales,
      prepaid_sales: prepaidSales,
      partial_sales: partialSales,
      total_sales_from_split: total,
      cod_percent: total > 0 ? (codSales / total) * 100 : 0,
      prepaid_percent: total > 0 ? (prepaidSales / total) * 100 : 0,
      partial_percent: total > 0 ? (partialSales / total) * 100 : 0,
      sql_used: includeSql ? sql : undefined,
    };
  }

  async function getOrderSplit({
    conn,
    start,
    end,
    hourLte = null,
    productId = "",
    filters = {},
    includeSql = false,
    timezone = DEFAULT_TIMEZONE,
  }) {
    const resolvedTimezone = normalizeTimezone(timezone);
    const effectiveStart = start || end;
    const effectiveEnd = end || start;
    const useHourlyCutoff = Number.isInteger(hourLte);

    if (productId || hasCityFilter(filters)) {
      if (!effectiveStart || !effectiveEnd) {
        return computeOrderSplitPayload({
          start: effectiveStart,
          end: effectiveEnd,
          timezone: resolvedTimezone,
          productId,
        });
      }

      const isSingleDay = effectiveStart === effectiveEnd;
      let whereSql = isSingleDay
        ? `WHERE created_date = ?`
        : `WHERE created_date >= ? AND created_date <= ?`;
      const replacements = isSingleDay
        ? [effectiveStart]
        : [effectiveStart, effectiveEnd];

      if (productId) {
        whereSql += ` AND product_id = ?`;
        replacements.push(productId);
      }
      if (useHourlyCutoff) {
        whereSql += ` AND created_time < ?`;
        replacements.push(buildCompletedHourOrderCutoffTime(hourLte));
      }
      whereSql = appendUtmWhere(whereSql, replacements, filters, true);
      whereSql = appendCityOrderWhere(whereSql, replacements, filters.city);

      const sql = `
        SELECT payment_type, COUNT(DISTINCT order_name) AS cnt
        FROM (
          SELECT
            ${PAYMENT_TYPE_CASE_SQL} AS payment_type,
            order_name
          FROM shopify_orders
          ${whereSql}
          GROUP BY payment_gateway_names, order_name
        ) sub
        GROUP BY payment_type
      `;

      const rows = await conn.query(sql, {
        type: QueryTypes.SELECT,
        replacements,
      });

      let codOrders = 0;
      let prepaidOrders = 0;
      let partiallyPaidOrders = 0;
      for (const row of rows) {
        if (row.payment_type === "COD") {
          codOrders = Number(row.cnt || 0);
        } else if (row.payment_type === "Prepaid") {
          prepaidOrders = Number(row.cnt || 0);
        } else if (row.payment_type === "Partial") {
          partiallyPaidOrders = Number(row.cnt || 0);
        }
      }

      return computeOrderSplitPayload({
        start: effectiveStart,
        end: effectiveEnd,
        timezone: resolvedTimezone,
        hourLte: useHourlyCutoff ? hourLte : null,
        productId,
        codOrders,
        prepaidOrders,
        partiallyPaidOrders,
        includeSql,
        sql,
      });
    }

    const discountSource = resolveDiscountAggregateSource(
      filters,
      useHourlyCutoff ? "hourly" : "daily",
    );
    if (discountSource && !productId) {
      let sql = `
        SELECT
          payment_mode,
          COALESCE(SUM(total_orders), 0) AS orders
        FROM ${useHourlyCutoff ? "dashboard_discount_payment_hourly" : "dashboard_discount_payment_daily"}
        WHERE date >= ? AND date <= ?
      `;
      const replacements = [effectiveStart, effectiveEnd];
      if (useHourlyCutoff) {
        sql += ` AND hour <= ?`;
        replacements.push(hourLte);
      }
      sql = appendDiscountWhere(sql, replacements, filters);
      sql += ` GROUP BY payment_mode`;

      const rows = await conn.query(sql, {
        type: QueryTypes.SELECT,
        replacements,
      });

      let codOrders = 0;
      let prepaidOrders = 0;
      let partiallyPaidOrders = 0;
      for (const row of rows) {
        if (row.payment_mode === "cod") codOrders = Number(row.orders || 0);
        if (row.payment_mode === "prepaid") prepaidOrders = Number(row.orders || 0);
        if (row.payment_mode === "partially_paid") {
          partiallyPaidOrders = Number(row.orders || 0);
        }
      }

      return computeOrderSplitPayload({
        start: effectiveStart,
        end: effectiveEnd,
        timezone: resolvedTimezone,
        hourLte: useHourlyCutoff ? hourLte : null,
        codOrders,
        prepaidOrders,
        partiallyPaidOrders,
        includeSql,
        sql,
      });
    }

    const aggregateSource = resolveUtmAggregateSource(
      filters,
      useHourlyCutoff ? "hourly" : "daily",
    );
    if (aggregateSource) {
      let sql = `
        SELECT
          COALESCE(SUM(cod_orders), 0) AS cod_orders,
          COALESCE(SUM(prepaid_orders), 0) AS prepaid_orders,
          COALESCE(SUM(ppcod_orders), 0) AS partially_paid_orders
        FROM ${aggregateSource.table}
        WHERE metric_date >= ? AND metric_date <= ?
      `;
      const replacements = [effectiveStart, effectiveEnd];
      if (useHourlyCutoff) {
        sql += ` AND metric_hour <= ?`;
        replacements.push(hourLte);
      }
      sql = appendUtmWhere(sql, replacements, aggregateSource.filters, true);

      const [row] = await conn.query(sql, {
        type: QueryTypes.SELECT,
        replacements,
      });

      return computeOrderSplitPayload({
        start: effectiveStart,
        end: effectiveEnd,
        timezone: resolvedTimezone,
        hourLte: useHourlyCutoff ? hourLte : null,
        codOrders: Number(row?.cod_orders || 0),
        prepaidOrders: Number(row?.prepaid_orders || 0),
        partiallyPaidOrders: Number(row?.partially_paid_orders || 0),
        includeSql,
        sql,
      });
    }

    if (useHourlyCutoff) {
      const isSingleDay = effectiveStart === effectiveEnd;
      let whereSql = isSingleDay
        ? `WHERE created_date = ?`
        : `WHERE created_date >= ? AND created_date <= ?`;
      const replacements = isSingleDay
        ? [effectiveStart]
        : [effectiveStart, effectiveEnd];

      whereSql += ` AND created_time < ?`;
      replacements.push(buildCompletedHourOrderCutoffTime(hourLte));
      whereSql = appendUtmWhere(whereSql, replacements, filters, true);
      whereSql = appendCityOrderWhere(whereSql, replacements, filters.city);

      const sql = `
        SELECT payment_type, COUNT(DISTINCT order_name) AS cnt
        FROM (
          SELECT
            ${PAYMENT_TYPE_CASE_SQL} AS payment_type,
            order_name
          FROM shopify_orders
          ${whereSql}
          GROUP BY payment_gateway_names, order_name
        ) sub
        GROUP BY payment_type
      `;

      const rows = await conn.query(sql, {
        type: QueryTypes.SELECT,
        replacements,
      });

      let codOrders = 0;
      let prepaidOrders = 0;
      let partiallyPaidOrders = 0;
      for (const row of rows) {
        if (row.payment_type === "COD") {
          codOrders = Number(row.cnt || 0);
        } else if (row.payment_type === "Prepaid") {
          prepaidOrders = Number(row.cnt || 0);
        } else if (row.payment_type === "Partial") {
          partiallyPaidOrders = Number(row.cnt || 0);
        }
      }

      return computeOrderSplitPayload({
        start: effectiveStart,
        end: effectiveEnd,
        timezone: resolvedTimezone,
        hourLte,
        codOrders,
        prepaidOrders,
        partiallyPaidOrders,
        includeSql,
        sql,
      });
    }

    const { where, params } = buildWhereClause(start, end);
    const sql = `
      SELECT
        COALESCE(SUM(cod_orders), 0) AS cod_orders,
        COALESCE(SUM(prepaid_orders), 0) AS prepaid_orders,
        COALESCE(SUM(partially_paid_orders), 0) AS partially_paid_orders
      FROM overall_summary
      ${where}
    `;
    const [row] = await conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements: params,
    });

    const codOrders = Number(row?.cod_orders || 0);
    const prepaidOrders = Number(row?.prepaid_orders || 0);
    const partiallyPaidOrders = Number(row?.partially_paid_orders || 0);
    return computeOrderSplitPayload({
      start,
      end,
      timezone: resolvedTimezone,
      hourLte: useHourlyCutoff ? hourLte : null,
      codOrders,
      prepaidOrders,
      partiallyPaidOrders,
    });
  }

  async function getHourlySalesCompare({ conn, days, now = new Date(), timezone = DEFAULT_TIMEZONE }) {
    const resolvedTimezone = normalizeTimezone(timezone);
    const currentBuckets = buildTimezoneBuckets(days, resolvedTimezone, now);
    const previousBuckets = shiftBucketDays(currentBuckets, -1);

    const currentSpan = getBucketSpan(currentBuckets);
    const previousSpan = getBucketSpan(previousBuckets);
    const [currentRows, previousRows] = await Promise.all([
      fetchHourlySalesRange(conn, currentSpan?.start, currentSpan?.end),
      fetchHourlySalesRange(conn, previousSpan?.start, previousSpan?.end),
    ]);

    const currentBucketKeys = new Set(
      currentBuckets.map((bucket) => `${bucket.date}#${bucket.hour}`),
    );
    const previousBucketKeys = new Set(
      previousBuckets.map((bucket) => `${bucket.date}#${bucket.hour}`),
    );
    const currentMap = new Map();
    const previousMap = new Map();

    for (const row of currentRows) {
      const key = `${row.date}#${row.hour}`;
      if (currentBucketKeys.has(key)) {
        currentMap.set(key, Number(row.total_sales || 0));
      }
    }
    for (const row of previousRows) {
      const key = `${row.date}#${row.hour}`;
      if (previousBucketKeys.has(key)) {
        previousMap.set(key, Number(row.total_sales || 0));
      }
    }

    return {
      labels: currentBuckets.map((bucket) => `${pad2(bucket.hour)}:00`),
      series: {
        current: currentBuckets.map(
          (bucket) => currentMap.get(`${bucket.date}#${bucket.hour}`) || 0,
        ),
        yesterday: previousBuckets.map(
          (bucket) => previousMap.get(`${bucket.date}#${bucket.hour}`) || 0,
        ),
      },
      timezone: resolvedTimezone,
      tz: resolvedTimezone,
    };
  }

  return {
    getTrafficSourceSplit,
    getPaymentSalesSplit,
    getOrderSplit,
    getHourlySalesCompare,
  };
}

module.exports = {
  buildMetricsReportService,
  resolveCompareRange,
  parseHourLte,
  buildClosedOpenTimestampRange,
  buildTimezoneBuckets,
  buildIstBuckets,
};
