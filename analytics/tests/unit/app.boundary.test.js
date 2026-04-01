/* eslint-env jest */

const path = require("path");

describe("analytics app boundary", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("keeps the restored integration and machine-admin routes while auth routes stay removed", async () => {
    const { app } = require("../../app");
    const stack = app.router.stack || [];
    const hasHealth = stack.some((layer) => layer.route?.path === "/health");
    const routePaths = [];
    const collectPaths = (layers) => {
      for (const layer of layers) {
        if (layer.route?.path) {
          routePaths.push(layer.route.path);
        } else if (layer.name === "router" && layer.handle?.stack) {
          collectPaths(layer.handle.stack);
        }
      }
    };

    collectPaths(stack);

    expect(hasHealth).toBe(true);
    expect(routePaths).toContain("/summary");
    expect(routePaths).toContain("/summary-filter-options");
    expect(routePaths).toContain("/order-split");
    expect(routePaths).toContain("/payment-sales-split");
    expect(routePaths).toContain("/traffic-source-split");
    expect(routePaths).toContain("/hourly-trend");
    expect(routePaths).toContain("/daily-trend");
    expect(routePaths).toContain("/monthly-trend");
    expect(routePaths).toContain("/top-products");
    expect(routePaths).toContain("/product-kpis");
    expect(routePaths).toContain("/product-conversion");
    expect(routePaths).toContain("/product-conversion/export");
    expect(routePaths).toContain("/product-types");
    expect(routePaths).toContain("/hourly-sales-summary");
    expect(routePaths).toContain("/last-updated/pts");
    expect(routePaths).toContain("/qr-scans");
    expect(routePaths).toContain("/upload");
    expect(routePaths).toContain("/uploads");
    expect(routePaths).toContain("/subscribe");
    expect(routePaths).toContain("/upload-file");
    expect(routePaths).toContain("/admin/api-keys");
    expect(routePaths).not.toContain("/aov");
    expect(routePaths).not.toContain("/cvr");
    expect(routePaths).not.toContain("/cvr-delta");
    expect(routePaths).not.toContain("/total-orders-delta");
    expect(routePaths).not.toContain("/total-sales-delta");
    expect(routePaths).not.toContain("/rolling-30d");
    expect(routePaths).not.toContain("/total-sessions-delta");
    expect(routePaths).not.toContain("/atc-sessions-delta");
    expect(routePaths).not.toContain("/aov-delta");
    expect(routePaths).not.toContain("/total-sales");
    expect(routePaths).not.toContain("/total-orders");
    expect(routePaths).not.toContain("/funnel-stats");
    expect(routePaths).not.toContain("/delta-summary");

    expect(routePaths).not.toContain("/auth/me");
    expect(routePaths).not.toContain("/login");
    expect(routePaths).not.toContain("/logout");
    expect(routePaths).not.toContain("/brands");
    expect(routePaths).not.toContain("/me");
  });

  test("package dependencies no longer include removed auth and integration runtime deps", () => {
    const pkg = require(path.join(__dirname, "../../package.json"));
    const deps = pkg.dependencies || {};

    expect(deps).not.toHaveProperty("connect-redis");
    expect(deps).not.toHaveProperty("connect-session-sequelize");
    expect(deps).not.toHaveProperty("express-session");
    expect(deps).not.toHaveProperty("passport");
    expect(deps).not.toHaveProperty("passport-google-oauth20");
    expect(deps).not.toHaveProperty("passport-local");
    expect(deps).not.toHaveProperty("cookie-parser");
    expect(deps).toHaveProperty("firebase-admin");
    expect(deps).toHaveProperty("multer");
    expect(deps).toHaveProperty("form-data");
    expect(deps).toHaveProperty("aws-sdk");
  });
});
