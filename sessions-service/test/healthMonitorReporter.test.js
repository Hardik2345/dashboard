const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createHealthMonitorReporter } = require("../src/healthMonitor");

function buildResponse(statusCode, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.getHeaders = () => headers;
  res.json = (body) => body;
  res.send = (body) => body;
  return res;
}

test("health monitor reporter emits failure and recovery events", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({
      url,
      body: JSON.parse(options.body),
    });
    return {
      ok: true,
      async text() {
        return "ok";
      },
    };
  };

  const reporter = createHealthMonitorReporter({
    serviceName: "sessions-service",
    baseUrl: "http://sessions-service:4010",
  });

  const failureReq = {
    method: "POST",
    baseUrl: "/sessions",
    path: "/",
    originalUrl: "/sessions",
    route: { path: "/" },
    headers: {
      authorization: "Bearer secret",
      "content-type": "application/json",
    },
    params: {},
    query: {},
    body: { token: "secret" },
    ip: "127.0.0.1",
  };
  const failureRes = buildResponse(500, { "content-type": "application/json" });
  reporter(failureReq, failureRes, () => undefined);
  failureRes.json({ error: "session_create_failed", errorType: "application_exception" });
  failureRes.emit("finish");

  const successReq = {
    ...failureReq,
    body: { ok: true },
  };
  const successRes = buildResponse(201, { "content-type": "application/json" });
  reporter(successReq, successRes, () => undefined);
  successRes.json({ id: "session-1" });
  successRes.emit("finish");

  await new Promise((resolve) => setImmediate(resolve));
  global.fetch = originalFetch;

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/events\/failures$/);
  assert.equal(calls[0].body.requestContext.body.token, "[REDACTED]");
  assert.equal(calls[0].body.requestContext.headers.authorization, "[REDACTED]");
  assert.match(calls[1].url, /\/events\/successes$/);
  assert.equal(calls[1].body.statusCode, 201);
});
