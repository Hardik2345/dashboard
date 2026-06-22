/* eslint-env jest */

describe("dashboard layout router identity edge", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.GATEWAY_SHARED_SECRET;
  });

  function buildRouter(overrides = {}) {
    const { buildDashboardRouter } = require("../../../modules/dashboard");
    const model = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      ...overrides,
    };
    return {
      router: buildDashboardRouter({ layoutModel: model }),
      model,
    };
  }

  function invoke(router, { method, url, headers = {}, body = {} }) {
    return new Promise((resolve, reject) => {
      const req = {
        method,
        url,
        originalUrl: url,
        headers,
        body,
        query: {},
        get(name) {
          return this.headers[String(name).toLowerCase()];
        },
      };

      const res = {
        statusCode: 200,
        body: null,
        headers: {},
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

  test("GET /layout returns defaults when the user is authorized", async () => {
    const { router } = buildRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/layout",
      headers: {
        "x-user-id": "user-1",
        "x-brand-key": "TMC",
        "x-role": "user",
        "x-permissions": "dashboard_layout_customize",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      version: 1,
      desktop: [
        "kpi_cards",
        "kpi_trend",
        "payment_split",
        "payment_trend",
        "traffic_split",
      ],
      mobile: [
        "kpi_cards",
        "kpi_trend",
        "top_pages",
        "payment_split",
        "payment_trend",
        "traffic_split",
      ],
    });
  });

  test("POST /layout rejects callers without dashboard_layout_customize", async () => {
    const { router } = buildRouter();
    const response = await invoke(router, {
      method: "POST",
      url: "/layout",
      headers: {
        "x-user-id": "user-1",
        "x-brand-key": "TMC",
        "x-role": "user",
        "x-permissions": "traffic_split",
      },
      body: {
        desktop: ["traffic_split", "kpi_cards"],
        mobile: ["kpi_cards"],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  test("author callers still bypass explicit permission checks", async () => {
    const { router } = buildRouter();
    const response = await invoke(router, {
      method: "POST",
      url: "/layout",
      headers: {
        "x-user-id": "user-1",
        "x-brand-key": "TMC",
        "x-role": "author",
      },
      body: {
        desktop: ["traffic_split", "kpi_cards"],
        mobile: ["kpi_cards", "traffic_split"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.version).toBe(1);
  });
});
