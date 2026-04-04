const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const { extractFilters } = require('../../shared/utils/filters');
const {
  parseRangeQuery,
  ensureBrandSequelize,
} = require('./requestNormalizer');

const SHOP_DOMAIN_CACHE = new Map();

function resolveShopSubdomain(brandKey) {
  if (!brandKey) return null;
  const upper = brandKey.toString().trim().toUpperCase();
  if (SHOP_DOMAIN_CACHE.has(upper)) return SHOP_DOMAIN_CACHE.get(upper);
  const candidates = [
    `SHOP_NAME_${upper}`,
    `${upper}_SHOP_NAME`,
    `SHOP_DOMAIN_${upper}`,
    `${upper}_SHOP_DOMAIN`,
  ];
  for (const envKey of candidates) {
    const value = process.env[envKey];
    if (value && value.trim()) {
      const trimmed = value.trim();
      SHOP_DOMAIN_CACHE.set(upper, trimmed);
      return trimmed;
    }
  }
  SHOP_DOMAIN_CACHE.set(upper, null);
  return null;
}

function buildProductController({ pageService }) {
  return {
    topProductPages: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) return res.status(400).json({ error: 'start or end date required' });
        if (rangeStart > rangeEnd) return res.status(400).json({ error: 'start must be on or before end' });
        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 20)
          : 5;
        return res.json(
          await pageService.getTopProductPages({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            limit,
            resolveShopSubdomain,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'top-pdps failed');
      }
    },

    topProducts: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) return res.status(400).json({ error: 'start or end date required' });
        if (rangeStart > rangeEnd) return res.status(400).json({ error: 'start must be on or before end' });
        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 50)
          : 50;
        return res.json(
          await pageService.getTopProducts({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            limit,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'top-products failed');
      }
    },

    productKpis: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) return res.status(400).json({ error: 'start or end date required' });
        if (rangeStart > rangeEnd) return res.status(400).json({ error: 'start must be on or before end' });
        return res.json(
          await pageService.getProductKpis({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            filters: extractFilters(req),
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'product-kpis failed');
      }
    },

    productTypes: async (req, res) => {
      try {
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        return res.json(
          await pageService.getProductTypes({
            conn: brandConn.conn,
            date: req.query.date,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'product-types failed');
      }
    },

    hourlyProductSessionsExport: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query, { defaultToToday: true });
        if (!parsed.ok) return res.status(parsed.status).json(parsed.body);
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        const filters = {};
        const filterKeys = [
          'product_id', 'landing_page_path',
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
          'referrer_name',
        ];
        for (const key of filterKeys) {
          if (req.query[key]) filters[key] = req.query[key];
        }
        if (req.query.hour !== undefined) filters.hour = req.query.hour;
        const exportResult = await pageService.getHourlyProductSessionsExport({
          conn: brandConn.conn,
          brandKey: (req.brandKey || '').toString().trim().toUpperCase(),
          start,
          end,
          filters,
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
        return res.send(exportResult.csv);
      } catch (e) {
        return handleControllerError(res, e, 'hourly-product-sessions-export failed');
      }
    },

    hourlySalesSummary: async (req, res) => {
      try {
        const brandKey = (req.brandKey || req.query.brand_key || '')
          .toString()
          .trim()
          .toUpperCase();
        if (!brandKey) return res.status(400).json({ error: 'Brand key required' });
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) return res.status(brandConn.status).json(brandConn.body);
        return res.json(
          await pageService.getHourlySalesSummary({
            conn: brandConn.conn,
            brandKey,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'hourly-sales-summary failed');
      }
    },
  };
}

module.exports = { buildProductController };
