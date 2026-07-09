require("dotenv").config();

const fs = require("fs");
const path = require("path");

const STATE_FILE = process.env.ALERTS_TEST_FAILURE_FILE
  || path.join("/tmp", "alerts-service-test-failure.json");

function defaultFailureState() {
  return {
    active: false,
    scenarioId: null,
    enabledAt: null,
    type: "application_exception",
    healthMessage: "dependencies_healthy",
    functionalStatusCode: 503,
    functionalCode: "simulated_alerts_service_failure",
    functionalMessage:
      "Simulated alert processing failure after dependency validation completed successfully.",
    failingSubsystem: "notification_dispatch",
    failureStage: "post-validation fanout",
    retryable: true,
    dependencies: {
      mongo: {
        status: "UP",
        message: "Connected",
      },
      redis: {
        status: "UP",
        message: "Connected",
      },
    },
    stack: [
      "Error: Simulated alert dispatch failure",
      "    at dispatchAlertBatch (/app/services/notificationDispatcher.js:184:17)",
      "    at emitAlertToChannels (/app/services/notificationDispatcher.js:233:11)",
      "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "    at async handleIncomingAlert (/app/app.js:1:1)",
    ],
  };
}

function readFailureState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return defaultFailureState();
    }

    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultFailureState(),
      ...parsed,
      dependencies: parsed?.dependencies || defaultFailureState().dependencies,
      stack: Array.isArray(parsed?.stack) ? parsed.stack : defaultFailureState().stack,
    };
  } catch (_error) {
    return defaultFailureState();
  }
}

function writeFailureState(nextState) {
  const merged = {
    ...defaultFailureState(),
    ...nextState,
    dependencies: nextState?.dependencies || defaultFailureState().dependencies,
    stack: Array.isArray(nextState?.stack) ? nextState.stack : defaultFailureState().stack,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/test-failure.js enable");
  console.log("  node scripts/test-failure.js disable");
  console.log("  node scripts/test-failure.js status");
}

function enableFailureMode() {
  const scenarioId = `alerts-failure-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const next = writeFailureState({
    active: true,
    scenarioId,
    enabledAt: new Date().toISOString(),
    type: "application_exception",
    healthMessage:
      "Intentional test failure: alert dispatch pipeline is failing after dependency validation.",
    functionalStatusCode: 503,
    functionalCode: "simulated_alert_dispatch_failure",
    functionalMessage:
      "Simulated alert dispatch failure: request accepted by the container but processing aborted during notification fanout.",
    failingSubsystem: "notification_dispatch",
    failureStage: "fanout_to_channels",
    retryable: true,
    dependencies: {
      mongo: {
        status: "UP",
        message: "Connected",
      },
      redis: {
        status: "UP",
        message: "Connected",
      },
    },
    stack: [
      "Error: Simulated alert dispatch failure",
      "    at dispatchAlertBatch (/app/services/notificationDispatcher.js:184:17)",
      "    at emitAlertToChannels (/app/services/notificationDispatcher.js:233:11)",
      "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "    at async handleIncomingAlert (/app/app.js:1:1)",
    ],
  });

  console.log(JSON.stringify({
    action: "enabled",
    stateFile: STATE_FILE,
    state: next,
  }, null, 2));
}

function disableFailureMode() {
  const next = writeFailureState(defaultFailureState());
  console.log(JSON.stringify({
    action: "disabled",
    stateFile: STATE_FILE,
    state: next,
  }, null, 2));
}

function showStatus() {
  console.log(JSON.stringify({
    stateFile: STATE_FILE,
    state: readFailureState(),
  }, null, 2));
}

const command = (process.argv[2] || "").trim().toLowerCase();

if (!command) {
  usage();
  process.exit(1);
}

if (command === "enable") {
  enableFailureMode();
  process.exit(0);
}

if (command === "disable") {
  disableFailureMode();
  process.exit(0);
}

if (command === "status") {
  showStatus();
  process.exit(0);
}

usage();
process.exit(1);
