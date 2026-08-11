const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveDirectRoute, isDirectRouteConfigured } = require("../src/db/directRoute");

const baseEnv = {
  DB_URL: "primary.example.com",
  DB_USER: "admin",
  DB_PASSWORD: "secret",
  READ_REPLICA_URL: "replica.example.com",
};

test("isDirectRouteConfigured is false when DB_URL/DB_USER/DB_PASSWORD are incomplete", () => {
  assert.equal(isDirectRouteConfigured({}), false);
  assert.equal(isDirectRouteConfigured({ DB_URL: "x" }), false);
  assert.equal(isDirectRouteConfigured({ DB_URL: "x", DB_USER: "y" }), false);
  assert.equal(isDirectRouteConfigured(baseEnv), true);
});

test("write requests resolve to DB_URL", () => {
  const route = resolveDirectRoute("BBB", { forWrite: true }, baseEnv);
  assert.equal(route.host, "primary.example.com");
  assert.equal(route.dbName, "BBB");
  assert.equal(route.user, "admin");
  assert.equal(route.password, "secret");
});

test("read requests resolve to READ_REPLICA_URL", () => {
  const route = resolveDirectRoute("BBB", { forWrite: false }, baseEnv);
  assert.equal(route.host, "replica.example.com");
});

test("read requests fall back to DB_URL when READ_REPLICA_URL is unset", () => {
  const { READ_REPLICA_URL, ...envWithoutReplica } = baseEnv;
  const route = resolveDirectRoute("BBB", { forWrite: false }, envWithoutReplica);
  assert.equal(route.host, "primary.example.com");
});

test("resolveDirectRoute returns null when not configured, so callers fall back to tenant-router", () => {
  const route = resolveDirectRoute("BBB", { forWrite: true }, {});
  assert.equal(route, null);
});
