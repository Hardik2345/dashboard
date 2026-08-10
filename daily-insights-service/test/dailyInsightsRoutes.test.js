const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const { buildApp } = require("../src/app");

const GATEWAY_SECRET = "test-secret";

function gatewayHeaders({ userId = "u1", brand = "BBB", role = "brand_user", permissions = "" } = {}) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", GATEWAY_SECRET)
    .update([userId, brand, role, ts].join("|"))
    .digest("hex");
  return {
    "x-user-id": userId,
    "x-brand-id": brand,
    "x-role": role,
    "x-gw-ts": ts,
    "x-gw-sig": sig,
    "x-permissions": permissions,
  };
}

function fakeBrandContextFor(dbsByBrand) {
  return async function fakeBrandContext(req, res, next) {
    const brandKey = String(req.headers["x-brand-id"] || "").toUpperCase();
    if (!dbsByBrand.has(brandKey)) dbsByBrand.set(brandKey, makeFakeBrandDb(brandKey));
    req.brandKey = brandKey;
    req.brandDb = dbsByBrand.get(brandKey);
    return next();
  };
}

function makeFakeBrandDb(dbName) {
  const rowsByDate = new Map();
  return {
    dbName,
    async query(sql, options = {}) {
      const [date, insight] = options.replacements || [];
      if (/^CREATE TABLE/.test(sql.trim())) return [];
      if (sql.startsWith("SELECT id, date, insight, updated_at")) {
        const row = rowsByDate.get(date);
        return row ? [row] : [];
      }
      if (sql.startsWith("INSERT INTO daily_insights")) {
        const existing = rowsByDate.get(date);
        rowsByDate.set(date, { id: existing?.id || rowsByDate.size + 1, date, insight, updated_at: "2026-08-10 10:00:00" });
        return [];
      }
      if (sql.startsWith("SELECT date, updated_at")) {
        return [...rowsByDate.values()].map(({ date: d, updated_at }) => ({ date: d, updated_at }));
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function buildTestApp() {
  const dbsByBrand = new Map();
  const { app } = buildApp({
    config: {
      port: 0,
      corsOrigins: [],
      gatewaySharedSecret: GATEWAY_SECRET,
      allowInsecureAuth: false,
      authKeys: "",
      insightCharLimit: 250,
    },
    brandContext: fakeBrandContextFor(dbsByBrand),
  });
  return { app, dbsByBrand };
}

test("POST then GET round-trips an insight for an author", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "author" });

  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "Revenue increased 18% today" })
    .expect(200);

  const res = await request(app).get("/daily-insights").query({ date: "2026-08-10" }).set(headers).expect(200);
  assert.equal(res.body.data.insight, "Revenue increased 18% today");
  assert.equal(res.body.data.date, "2026-08-10");
});

test("editing an older date keeps the original date", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "author" });

  await request(app).post("/daily-insights").set(headers).send({ date: "2026-08-01", insight: "old" }).expect(200);
  const res = await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-01", insight: "old, edited later" })
    .expect(200);

  assert.equal(res.body.data.date, "2026-08-01");
  assert.equal(res.body.data.insight, "old, edited later");
});

test("empty insight is rejected with 400", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "author" });
  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "   " })
    .expect(400);
});

test("insight longer than the configured char limit is rejected with 400", async () => {
  const dbsByBrand = new Map();
  const { app } = buildApp({
    config: {
      port: 0,
      corsOrigins: [],
      gatewaySharedSecret: GATEWAY_SECRET,
      allowInsecureAuth: false,
      authKeys: "",
      insightCharLimit: 10,
    },
    brandContext: fakeBrandContextFor(dbsByBrand),
  });
  const headers = gatewayHeaders({ role: "author" });

  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "this is way more than ten characters" })
    .expect(400);

  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "short" })
    .expect(200);
});

test("invalid date is rejected with 400", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "author" });
  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "10-08-2026", insight: "hello" })
    .expect(400);
});

test("brand_user (non-author) cannot create/update, even with every other permission", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "brand_user", permissions: "all,daily_insight_view" });
  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "should be forbidden" })
    .expect(403);
});

test("brand_user (non-author) cannot access the edit history endpoint", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "brand_user", permissions: "all,daily_insight_view" });
  await request(app).get("/daily-insights/history").set(headers).expect(403);
});

test("admin role can create/update (author/admin are both treated as elevated)", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "admin" });
  await request(app)
    .post("/daily-insights")
    .set(headers)
    .send({ date: "2026-08-10", insight: "allowed for admin" })
    .expect(200);
});

test("brand_user without daily_insight_view cannot view", async () => {
  const { app } = buildTestApp();
  const authorHeaders = gatewayHeaders({ role: "author" });
  await request(app).post("/daily-insights").set(authorHeaders).send({ date: "2026-08-10", insight: "viewable" }).expect(200);

  const viewerHeaders = gatewayHeaders({ role: "brand_user", permissions: "" });
  await request(app).get("/daily-insights").query({ date: "2026-08-10" }).set(viewerHeaders).expect(403);
});

test("brand_user granted daily_insight_view can view, but still cannot edit", async () => {
  const { app } = buildTestApp();
  const authorHeaders = gatewayHeaders({ role: "author" });
  await request(app).post("/daily-insights").set(authorHeaders).send({ date: "2026-08-10", insight: "viewable" }).expect(200);

  const viewerHeaders = gatewayHeaders({ role: "brand_user", permissions: "daily_insight_view" });
  const res = await request(app)
    .get("/daily-insights")
    .query({ date: "2026-08-10" })
    .set(viewerHeaders)
    .expect(200);
  assert.equal(res.body.data.insight, "viewable");

  await request(app)
    .post("/daily-insights")
    .set(viewerHeaders)
    .send({ date: "2026-08-10", insight: "attempted edit" })
    .expect(403);
});

test("requests with an invalid gateway signature are rejected", async () => {
  const { app } = buildTestApp();
  await request(app)
    .get("/daily-insights")
    .query({ date: "2026-08-10" })
    .set({ "x-user-id": "u1", "x-brand-id": "BBB", "x-role": "author", "x-gw-ts": "123", "x-gw-sig": "bad" })
    .expect(401);
});

test("brand databases are isolated from each other", async () => {
  const { app } = buildTestApp();
  const bbbHeaders = gatewayHeaders({ brand: "BBB", role: "author" });
  const ajmalHeaders = gatewayHeaders({ brand: "AJMAL", role: "author" });

  await request(app).post("/daily-insights").set(bbbHeaders).send({ date: "2026-08-10", insight: "BBB insight" }).expect(200);

  const ajmalRes = await request(app).get("/daily-insights").query({ date: "2026-08-10" }).set(ajmalHeaders).expect(200);
  assert.equal(ajmalRes.body.data, null);
});

test("GET with no insight for the date returns data: null", async () => {
  const { app } = buildTestApp();
  const headers = gatewayHeaders({ role: "author" });
  const res = await request(app).get("/daily-insights").query({ date: "2026-08-10" }).set(headers).expect(200);
  assert.equal(res.body.data, null);
});
