const axios = require("axios");
const { env } = require("../../config/env");

async function callOpenAiJson(messages, model) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: model || env.AI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
    {
      timeout: env.AI_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    },
  );
  const content = res.data?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

async function callJson(messages, model) {
  if (!env.AI_ENABLED) {
    throw new Error("AI_DISABLED");
  }
  if (env.AI_PROVIDER !== "openai") {
    throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
  }
  let lastError;
  for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt += 1) {
    try {
      return await callOpenAiJson(messages, model);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

module.exports = { callJson };
