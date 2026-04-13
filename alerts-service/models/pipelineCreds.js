const mongoose = require("mongoose");
const crypto = require("crypto");

const ALGO = "aes-256-cbc";

function normalizeKey(key) {
  const k = key || process.env.PASSWORD_AES_KEY;
  if (!k)
    throw new Error(
      "PASSWORD_AES_KEY env var is required for password encryption/decryption",
    );
  let buf = Buffer.from(k);
  if (buf.length < 32) {
    const padded = Buffer.alloc(32);
    buf.copy(padded);
    buf = padded;
  } else if (buf.length > 32) {
    buf = buf.slice(0, 32);
  }
  return buf;
}

function decryptText(encrypted, key) {
  if (!encrypted || !encrypted.toString().includes(":")) return encrypted;
  try {
    const k = normalizeKey(key);
    const [ivBase64, cipherBase64] = encrypted.split(":");
    const iv = Buffer.from(ivBase64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, k, iv);
    let decrypted = decipher.update(cipherBase64, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    console.error("[decryptText] Failed to decrypt:", e.message);
    return encrypted;
  }
}

const pipelineCredsSchema = new mongoose.Schema(
  {
    brand_id: {
      type: Number,
      required: true,
      unique: true,
    },
    brand_name: {
      type: String,
      required: true,
    },
    db_host: {
      type: String,
      required: true,
    },
    port: {
      type: Number,
      required: true,
    },
    db_password: {
      type: String,
      required: true,
    },
    db_user: {
      type: String,
      required: true,
    },
    access_token: {
      type: String,
      required: true,
    },
    api_version: {
      type: String,
      required: true,
    },
    app_id_mapping: {
      type: String,
      required: true,
    },
    brand_tag: {
      type: String,
      required: true,
    },
    db_database: {
      type: String,
      required: true,
      unique: true,
    },
    my_sql_url: {
      type: String,
      required: true,
    },
    shop_name: {
      type: String,
      required: true,
    },
    speed_key: {
      type: String,
      required: false,
      default: "",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "pipelinecreds" // Explicitly setting collection name
  },
);

pipelineCredsSchema.statics.decrypt = decryptText;

module.exports = mongoose.model("PipelineCreds", pipelineCredsSchema);
