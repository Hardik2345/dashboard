/* eslint-env jest */

const handler = (name) => jest.fn((req, res) => res.json({ ok: true, handler: name }));

const mockController = {
  orderSplit: handler("orderSplit"),
  paymentSalesSplit: handler("paymentSalesSplit"),
  trafficSourceSplit: handler("trafficSourceSplit"),
  dashboardSummary: handler("dashboardSummary"),
  topProductPages: handler("topProductPages"),
  topProducts: handler("topProducts"),
  productKpis: handler("productKpis"),
  hourlyTrend: handler("hourlyTrend"),
  dailyTrend: handler("dailyTrend"),
  monthlyTrend: handler("monthlyTrend"),
  productConversion: handler("productConversion"),
  productConversionCsv: handler("productConversionCsv"),
  hourlyProductSessionsExport: handler("hourlyProductSessionsExport"),
  productTypes: handler("productTypes"),
  hourlySalesCompare: handler("hourlySalesCompare"),
  hourlySalesSummary: handler("hourlySalesSummary"),
  diagnoseTotalOrders: jest.fn(() => handler("diagnoseTotalOrders")),
};

const mockBrandContext = jest.fn((req, _res, next) => {
  req.brandDb = { sequelize: {} };
  req.brandKey = req.user?.brandKey || req.apiKey?.brandKey || "TMC";
  next();
});

const mockAuthorizeBrandContext = jest.fn((req, _res, next) => {
  req.brandDb = { sequelize: {} };
  req.brandKey = req.user?.brandKey || "TMC";
  next();
});

const mockApiKeyAuth = jest.fn((req, _res, next) => {
  req.apiKey = { id: "key-1", brandKey: "TMC" };
  req.brandKey = "TMC";
  next();
});

jest.mock("../../../controllers/metricsController", () => ({
  buildMetricsController: jest.fn(() => mockController),
}));

jest.mock("../../../middlewares/brandContext", () => ({
  brandContext: (...args) => mockBrandContext(...args),
  authorizeBrandContext: (...args) => mockAuthorizeBrandContext(...args),
}));

jest.mock("../../../middlewares/apiKeyAuth", () => ({
  createApiKeyAuthMiddleware: jest.fn(() => (...args) => mockApiKeyAuth(...args)),
}));

describe("metrics router identity edge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GATEWAY_SHARED_SECRET;
  });

  function createRouter() {
    const { buildMetricsRouter } = require("../../../routes/metrics");
    return buildMetricsRouter({});
  }

  function invoke(router, { method, url, headers = {}, query = {}, body = {} }) {
    return new Promise((resolve, reject) => {
      const req = {
        method,
        url,
        originalUrl: url,
        headers,
        query,
        body,
        get(name) {
          return this.headers[String(name).toLowerCase()];
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        ended: false,
        setHeader(name, value) {
          this.headers[name] = value;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          this.ended = true;
          resolve(this);
          return this;
        },
        send(payload) {
          this.body = payload;
          this.ended = true;
          resolve(this);
          return this;
        },
        end(payload) {
          this.body = payload ?? this.body;
          this.ended = true;
          resolve(this);
          return this;
        },
      };

      router.handle(req, res, (err) => {
        if (err) reject(err);
        else if (!res.ended) resolve(res);
      });
    });
  }

  test("allows trusted upstream principals onto retained analytics routes", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/summary",
      headers: {
        "x-user-id": "u-1",
        "x-brand-key": "TMC",
        "x-role": "user",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true, handler: "dashboardSummary" });
    expect(mockAuthorizeBrandContext).toHaveBeenCalled();
  });

  test("keeps author-only analytics routes guarded by upstream role", async () => {
    const router = createRouter();

    const forbidden = await invoke(router, {
      method: "GET",
      url: "/product-conversion",
      headers: {
        "x-user-id": "u-1",
        "x-brand-key": "TMC",
        "x-role": "user",
      },
    });

    expect(forbidden.statusCode).toBe(403);

    const allowed = await invoke(router, {
      method: "GET",
      url: "/product-conversion",
      headers: {
        "x-user-id": "u-2",
        "x-brand-key": "TMC",
        "x-role": "author",
      },
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toEqual({ ok: true, handler: "productConversion" });
  });

  test("still allows direct machine callers through API key auth", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/top-products",
      headers: {
        authorization: "Bearer sk_prod_test",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true, handler: "topProducts" });
    expect(mockApiKeyAuth).toHaveBeenCalled();
    expect(mockBrandContext).toHaveBeenCalled();
  });
});
