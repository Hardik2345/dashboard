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

function encryptText(plain, key) {
  const k = normalizeKey(key);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, k, iv);
  let encrypted = cipher.update(plain.toString(), "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
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
  },
);

// Pre-save encryption hook
pipelineCredsSchema.pre("save", async function () {
  // Encrypt db_password
  if (
    this.isModified("db_password") &&
    this.db_password &&
    !this.db_password.toString().includes(":")
  ) {
    this.db_password = encryptText(this.db_password);
  }

  // Encrypt access_token
  if (
    this.isModified("access_token") &&
    this.access_token &&
    !this.access_token.toString().includes(":")
  ) {
    this.access_token = encryptText(this.access_token);
  }

  // Encrypt speed_key
  if (
    this.isModified("speed_key") &&
    this.speed_key &&
    !this.speed_key.toString().includes(":")
  ) {
    this.speed_key = encryptText(this.speed_key);
  }
});

module.exports = mongoose.model("PipelineCreds", pipelineCredsSchema);
