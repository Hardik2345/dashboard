const { registerWithHealthMonitor } = require("../src/healthMonitorRegistration");

describe("registerWithHealthMonitor", () => {
    afterEach(() => {
        delete global.fetch;
        delete process.env.HEALTH_MONITOR_REGISTER_URL;
    });

    test("returns false and does not throw when the monitor is unavailable", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
        const logger = {
            info: jest.fn(),
            warn: jest.fn(),
        };

        await expect(registerWithHealthMonitor({
            serviceName: "auth-service",
            baseUrl: "http://auth-service:3001",
            healthEndpoint: "/health",
            endpoints: [],
        }, logger)).resolves.toBe(false);

        expect(logger.warn).toHaveBeenCalled();
    });
});
