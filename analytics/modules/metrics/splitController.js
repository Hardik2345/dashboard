const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const { extractFilters } = require('../../shared/utils/filters');
const { getBrands } = require('../../config/brands');
const { getBrandConnection } = require('../../shared/db/brandConnectionManager');
const {
  parseHourLte,
} = require('../../services/metricsReportService');
const {
  parseRangeQuery,
  ensureBrandSequelize,
} = require('./requestNormalizer');

function buildSplitController({ reportService }) {
  return {
    trafficSourceSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(400).json({ error: 'Invalid date range' });
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        return res.json(
          await reportService.getTrafficSourceSplit({
            conn: brandConn.conn,
            start,
            end,
            compareStart: req.query.compare_start || null,
            compareEnd: req.query.compare_end || null,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'traffic-source-split failed');
      }
    },

    orderSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const { hourLte } = parseHourLte(req.query.hour_lte);
        return res.json(
          await reportService.getOrderSplit({
            conn: brandConn.conn,
            start,
            end,
            hourLte,
            productId: (req.query.product_id || '').toString().trim(),
            filters: extractFilters(req),
            includeSql: process.env.NODE_ENV !== 'production',
          }),
        );
      } catch (err) {
        return handleControllerError(res, err, 'order-split failed');
      }
    },

    paymentSalesSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const { hourLte } = parseHourLte(req.query.hour_lte);
        return res.json(
          await reportService.getPaymentSalesSplit({
            conn: brandConn.conn,
            start,
            end,
            hourLte,
            productId: (req.query.product_id || '').toString().trim(),
            filters: extractFilters(req),
            includeSql: process.env.NODE_ENV !== 'production',
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'payment-sales-split failed');
      }
    },

    hourlySalesCompare: async (req, res) => {
      try {
        const brandKey = (req.query.brand_key || req.query.brand || '')
          .toString()
          .trim()
          .toUpperCase();
        if (!brandKey) return res.status(400).json({ error: 'brand_key required' });
        const map = getBrands();
        if (!map[brandKey]) return res.status(400).json({ error: 'Unknown brand_key' });
        const brandConn = await getBrandConnection(map[brandKey]);
        const daysParam = (req.query.days || '').toString();
        const N = Number(daysParam) || 1;
        if (N <= 0 || N > 30) return res.status(400).json({ error: 'days must be between 1 and 30' });
        return res.json(
          await reportService.getHourlySalesCompare({
            conn: brandConn.sequelize,
            days: N,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'hourly-sales-compare failed');
      }
    },
  };
}

module.exports = { buildSplitController };
