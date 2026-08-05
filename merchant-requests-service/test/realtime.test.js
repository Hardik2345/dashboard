const test = require("node:test");
const assert = require("node:assert/strict");

const { webhookOutcome } = require("../src/routes/webhook");
const { emitRequestEvent, setIO } = require("../src/services/realtime");
const { roomsForPrincipal } = require("../src/services/socket");

test("request events fan out once to the brand and author rooms", () => {
  const rooms = [];
  const emitted = [];
  const operator = {
    to(room) {
      rooms.push(room);
      return operator;
    },
    emit(eventName, payload) {
      emitted.push({ eventName, payload });
    },
  };
  setIO({ to: operator.to });

  emitRequestEvent(
    "merchant-request:updated",
    { _id: "request-1", brand_key: "TMC" },
    { marker: "updated" },
  );

  assert.deepEqual(rooms, ["brand:TMC", "role:author"]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].eventName, "merchant-request:updated");
  assert.equal(emitted[0].payload.request_id, "request-1");
  assert.equal(emitted[0].payload.marker, "updated");
});

test("merchant socket rooms remain restricted to allowed brands", () => {
  const rooms = roomsForPrincipal({
    isAuthor: false,
    brand_key: "tmc",
    brand_ids: ["PTS"],
    memberships: [{ brand_id: "ABC" }],
  });

  assert.deepEqual(rooms, ["brand:TMC", "brand:PTS", "brand:ABC"]);
  assert.ok(!rooms.includes("role:author"));
});

test("authors join the author broadcast room", () => {
  assert.deepEqual(roomsForPrincipal({ isAuthor: true, brand_ids: [] }), ["role:author"]);
});

test("webhook outcome logging is concise and identifies ignored deliveries", () => {
  const summary = webhookOutcome(
    {
      event_name: "item:updated",
      event_data: {
        id: "task-1",
        content: "sensitive task title",
        description: "sensitive description",
      },
    },
    "delivery-1",
    { ignored: true },
  );

  assert.deepEqual(summary, {
    delivery_id: "delivery-1",
    event_name: "item:updated",
    task_id: "task-1",
    outcome: "ignored",
  });
  assert.ok(!Object.hasOwn(summary, "content"));
  assert.ok(!Object.hasOwn(summary, "description"));
});
