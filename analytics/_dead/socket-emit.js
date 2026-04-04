// DEAD CODE — quarantined 2026-04-03
// Original: exported function emitKafkaMessage from utils/socket.js
// Reason: emitKafkaMessage() has zero callers. initSocket() and getIO() are live
//         and remain in utils/socket.js. Only this function is dead.
// Action: Verify no callers emerge, then delete this file.

const { getIO } = require('../utils/socket');
const logger = require('../utils/logger');

function emitKafkaMessage(message) {
  const io = getIO();
  if (io) {
    io.emit('kafka-message', message);
    logger.info('Emitted kafka-message via socket', { message });
  }
}

module.exports = { emitKafkaMessage };
