const { QueryTypes } = require("sequelize");
const { shiftDays } = require("../utils/dateUtils");
const { buildUtmWhereClause } = require("../utils/metricsUtils");
const {
  pad2,
  getNowIst,
  formatUtcDate,
  resolveCompareRange,
  buildCompletedHourCutoffContext,
} = require("./metricsFoundation");

function formatIstDate(date) {
  return formatUtcDate(date);
}

function buildIstCutoffContext(start, end, now = new Date()) {
  return buildCompletedHourCutoffContext(start, end, now);
}

function parseHourLte(hourLteRaw) {
  const hasHourLte =
    hourLteRaw !== undefined && hourLteRaw !== null && `${hourLteRaw}`.trim() !== "";
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

function buildIstBuckets(days, now = new Date()) {
  const buckets = [];
  const nowIst = getNowIst(now);
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(nowIst.getTime());
    day.setUTCDate(day.getUTCDate() - offset);
    const date = formatIstDate(day);
    const maxHour = offset === 0 ? day.getUTCHours() : 23;
    for (let hour = 0; hour <= maxHour; hour += 1) {
      buckets.push({ date, hour });
    }
  }
  return buckets;
}

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
  }) {
    const previousRange = resolveCompareRange(
      start,
      end,
      compareStart,
      compareEnd,
    );
    const rows = await conn.query(
      `
        SELECT date, utm_source
        FROM overall_traffic_split
        WHERE (date >= ? AND date <= ?) OR (date >= ? AND date <= ?)
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [
          start,
          end,
          previousRange?.start || start,
          previousRange?.end || end,
        ],
      },
    );
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
  }) {
    const range = buildClosedOpenTimestampRange(start, end, hourLte);
    if (!range) {
      return {
        metric: "PAYMENT_SPLIT_SALES",
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

    let whereSql = `WHERE created_at >= ? AND created_at < ?`;
    const replacements = [range.startTs, range.endTs];
    if (productId) {
      whereSql += ` AND product_id = ?`;
      replacements.push(productId);
    }
    const built = buildUtmWhereClause(filters, { prefixWithAnd: true });
    whereSql += built.clause;
    replacements.push(...built.params);

    const sql = `
      SELECT payment_type, SUM(max_price) AS sales
      FROM (
        SELECT 
          CASE 
            WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
            WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names IS NULL OR payment_gateway_names = '' THEN 'COD'
            ELSE 'Prepaid'
          END AS payment_type,
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
      range: {
        start: range.effectiveStart,
        end: range.effectiveEnd,
        hour_lte: Number.isInteger(hourLte) ? hourLte : null,
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

  async function getHourlySalesCompare({ conn, days, now = new Date() }) {
    const currentBuckets = buildIstBuckets(days, now);
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
      tz: "IST",
    };
  }

  return {
    getTrafficSourceSplit,
    getPaymentSalesSplit,
    getHourlySalesCompare,
  };
}

module.exports = {
  buildMetricsReportService,
  resolveCompareRange,
  buildIstCutoffContext,
  parseHourLte,
  buildClosedOpenTimestampRange,
  buildIstBuckets,
};
