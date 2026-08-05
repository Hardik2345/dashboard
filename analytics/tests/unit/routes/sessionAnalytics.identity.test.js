/* eslint-env jest */

const mockController = {
  summary: jest.fn((req, res) => res.json({ ok: true, user: req.user })),
  trend: jest.fn((req, res) => res.json([{ label: "00:00", sessions: 1 }])),
  brands: jest.fn((req, res) => res.json([{ brand: "TMC", sessions: 2, users: 1 }])),
  exportBrands: jest.fn((req, res) => res.send("brand,sessions,users")),
  users: jest.fn((req, res) => res.json({ rows: [], total: 0 })),
  exportUsers: jest.fn((req, res) => res.send("email,brand,sessions")),
  insights: jest.fn((req, res) => res.json({ mostActiveUser: {}, mostActiveBrand: {}, latestSession: {} })),
  filters: jest.fn((req, res) => res.json({ brands: ["TMC"], users: ["user@example.com"] })),
};

jest.mock("../../../controllers/sessionAnalytics.controller", () => mockController);

describe("session analytics router identity edge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GATEWAY_SHARED_SECRET;
  });

  function createRouter() {
    const { buildSessionAnalyticsRouter } = require("../../../routes/sessionAnalytics.routes");
    return buildSessionAnalyticsRouter();
  }

  function invoke(router, { method, url, headers = {}, query = {} }) {
    return new Promise((resolve, reject) => {
      const req = {
        method,
        url,
        originalUrl: url,
        headers,
        query,
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
      };

      router.handle(req, res, (err) => {
        if (err) reject(err);
        else if (!res.ended) resolve(res);
      });
    });
  }

  test("allows authors onto session analytics routes", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/summary",
      headers: {
        "x-user-id": "author-1",
        "x-brand-key": "TMC",
        "x-role": "author",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockController.summary).toHaveBeenCalled();
  });

  test("allows super_admin onto session analytics routes", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/summary",
      headers: {
        "x-user-id": "super-admin-1",
        "x-brand-key": "TMC",
        "x-role": "super_admin",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockController.summary).toHaveBeenCalled();
  });

  test("allows viewers with session_analytics and forwards allowed brands", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/summary",
      headers: {
        "x-user-id": "viewer-1",
        "x-brand-key": "TMC",
        "x-role": "viewer",
        "x-permissions": "session_analytics",
        "x-brand-ids": "TMC,BBB",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.user.allowedBrands).toEqual(["TMC", "BBB"]);
  });

  test("blocks viewers without session_analytics permission with the required payload", async () => {
    const router = createRouter();
    const response = await invoke(router, {
      method: "GET",
      url: "/summary",
      headers: {
        "x-user-id": "viewer-1",
        "x-brand-key": "TMC",
        "x-role": "viewer",
        "x-permissions": "inventory_panel",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: "Access denied",
    });
  });
});
