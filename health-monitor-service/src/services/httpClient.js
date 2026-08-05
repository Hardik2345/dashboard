function buildTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function headersToObject(headers) {
  const result = {};
  if (!headers || typeof headers.forEach !== "function") {
    return result;
  }

  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
    signal: buildTimeoutSignal(options.timeoutMs || 10000),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      json = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: headersToObject(response.headers),
    text,
    json,
  };
}

module.exports = { requestJson, headersToObject };
