const { HttpError } = require("./errors");

function parseBody(schema, body) {
  const result = schema.safeParse(body || {});
  if (!result.success) {
    throw new HttpError(400, "validation_error", result.error.flatten());
  }
  return result.data;
}

function parseQuery(schema, query) {
  const result = schema.safeParse(query || {});
  if (!result.success) {
    throw new HttpError(400, "validation_error", result.error.flatten());
  }
  return result.data;
}

module.exports = { parseBody, parseQuery };
