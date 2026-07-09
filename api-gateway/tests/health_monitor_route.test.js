jest.mock("../src/models/DomainRule.model", () => ({
    findOne: jest.fn(() => ({
        select: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue({ _id: "rule-1" }),
        })),
    })),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");

describe("GET /health/monitor", () => {
    beforeEach(() => {
        Object.defineProperty(mongoose.connection, "readyState", {
            value: 1,
            writable: true,
            configurable: true,
        });
    });

    test("returns structured dependency status", async () => {
        const response = await request(app).get("/health/monitor");

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.dependencies.mongo.status).toBe("UP");
    });
});
