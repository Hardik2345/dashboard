const test = require("node:test");
const assert = require("node:assert/strict");

const { isSuccessStatus } = require("../src/services/executorService");

test("executor treats any 2xx as success under family matching", () => {
  const endpoint = { method: "GET", path: "/health", successStatusFamily: "2xx" };

  assert.equal(isSuccessStatus(200, endpoint), true);
  assert.equal(isSuccessStatus(201, endpoint), true);
  assert.equal(isSuccessStatus(202, endpoint), true);
  assert.equal(isSuccessStatus(204, endpoint), true);
  assert.equal(isSuccessStatus(301, endpoint), false);
  assert.equal(isSuccessStatus(400, endpoint), false);
  assert.equal(isSuccessStatus(500, endpoint), false);
});

test("executor prefers exact expectedStatus over family semantics", () => {
  const endpoint = {
    method: "POST",
    path: "/sessions",
    expectedStatus: 201,
    successStatusFamily: "2xx",
  };

  assert.equal(isSuccessStatus(201, endpoint), true);
  assert.equal(isSuccessStatus(200, endpoint), false);
  assert.equal(isSuccessStatus(204, endpoint), false);
});

test("executor defaults to 2xx family for endpoints without success metadata", () => {
  const endpoint = { method: "GET", path: "/health" };

  assert.equal(isSuccessStatus(200, endpoint), true);
  assert.equal(isSuccessStatus(204, endpoint), true);
  assert.equal(isSuccessStatus(404, endpoint), false);
});
