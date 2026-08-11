const test = require("node:test");
const assert = require("node:assert/strict");

const { buildBrandContext } = require("../src/middleware/brandContext");

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ res: this, body });
      },
    };
    middleware(req, res, (err) => {
      if (err) reject(err);
      else resolve({ req, res });
    });
  });
}

test("GET requests are routed to the connection built from the read route", async () => {
  const seenRoutes = [];
  const middleware = buildBrandContext({
    resolveDirectRoute: (brandKey, { forWrite }) => ({
      brandId: brandKey,
      dbName: brandKey,
      host: forWrite ? "write-host" : "read-host",
    }),
    getTenantConnection: (route) => {
      seenRoutes.push(route);
      return { dbName: route.dbName, host: route.host };
    },
  });

  const req = { method: "GET", headers: { "x-brand-id": "BBB" }, query: {}, body: {} };
  await runMiddleware(middleware, req);

  assert.equal(seenRoutes[0].host, "read-host");
  assert.equal(req.brandDb.host, "read-host");
});

test("POST requests are routed to the connection built from the write route", async () => {
  const seenRoutes = [];
  const middleware = buildBrandContext({
    resolveDirectRoute: (brandKey, { forWrite }) => ({
      brandId: brandKey,
      dbName: brandKey,
      host: forWrite ? "write-host" : "read-host",
    }),
    getTenantConnection: (route) => {
      seenRoutes.push(route);
      return { dbName: route.dbName, host: route.host };
    },
  });

  const req = { method: "POST", headers: { "x-brand-id": "BBB" }, query: {}, body: {} };
  await runMiddleware(middleware, req);

  assert.equal(seenRoutes[0].host, "write-host");
  assert.equal(req.brandDb.host, "write-host");
});

test("falls back to tenant-router when resolveDirectRoute returns null", async () => {
  let tenantRouterCalled = false;
  const middleware = buildBrandContext({
    resolveDirectRoute: () => null,
    resolveTenantRoute: async (brandKey) => {
      tenantRouterCalled = true;
      return { brandId: brandKey, dbName: brandKey, host: "tenant-router-host" };
    },
    getTenantConnection: (route) => ({ dbName: route.dbName, host: route.host }),
  });

  const req = { method: "GET", headers: { "x-brand-id": "BBB" }, query: {}, body: {} };
  await runMiddleware(middleware, req);

  assert.equal(tenantRouterCalled, true);
  assert.equal(req.brandDb.host, "tenant-router-host");
});
