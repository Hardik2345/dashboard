/* eslint-env jest */

const crypto = require("crypto");

function createRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

describe("identityEdge middleware", () => {
  const originalSecret = process.env.GATEWAY_SHARED_SECRET;

  afterEach(() => {
    jest.resetModules();
    if (originalSecret === undefined) {
      delete process.env.GATEWAY_SHARED_SECRET;
    } else {
      process.env.GATEWAY_SHARED_SECRET = originalSecret;
    }
  });

  test("builds trusted principals from headers", () => {
    delete process.env.GATEWAY_SHARED_SECRET;
    const { buildPrincipalFromHeaders } = require("../../../middlewares/identityEdge");

    const principal = buildPrincipalFromHeaders({
      headers: {
        "x-user-id": "42",
        "x-brand-key": "tmc",
        "x-role": "Admin",
        "x-email": "USER@EXAMPLE.COM",
      },
    });

    expect(principal).toEqual({
      id: "42",
      brandKey: "TMC",
      role: "admin",
      isAuthor: true,
      email: "user@example.com",
    });
  });

  test("requires mandatory upstream principal headers", () => {
    delete process.env.GATEWAY_SHARED_SECRET;
    const { requireTrustedPrincipal } = require("../../../middlewares/identityEdge");
    const res = createRes();
    const next = jest.fn();

    requireTrustedPrincipal({ headers: {} }, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  test("verifies gateway signatures when a shared secret is configured", () => {
    process.env.GATEWAY_SHARED_SECRET = "top-secret";
    const { requireTrustedPrincipal } = require("../../../middlewares/identityEdge");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `u-1|TMC|user|${timestamp}`;
    const signature = crypto
      .createHmac("sha256", "top-secret")
      .update(payload)
      .digest("hex");

    const req = {
      headers: {
        "x-user-id": "u-1",
        "x-brand-key": "TMC",
        "x-role": "user",
        "x-email": "user@example.com",
        "x-gw-ts": timestamp,
        "x-gw-sig": signature,
      },
    };
    const res = createRes();
    const next = jest.fn();

    requireTrustedPrincipal(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: "u-1",
      brandKey: "TMC",
      role: "user",
      isAuthor: false,
      email: "user@example.com",
    });
  });

  test("blocks trusted-author routes for non-author roles", () => {
    delete process.env.GATEWAY_SHARED_SECRET;
    const { requireTrustedAuthor } = require("../../../middlewares/identityEdge");
    const res = createRes();
    const next = jest.fn();

    requireTrustedAuthor(
      {
        headers: {
          "x-user-id": "u-1",
          "x-brand-key": "TMC",
          "x-role": "user",
        },
      },
      res,
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({ error: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });
});
