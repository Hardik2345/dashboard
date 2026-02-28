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
  let encrypted = cipher.update(plain, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

function decryptText(enc, key) {
  const k = normalizeKey(key);
  if (typeof enc !== "string") return "";
  const parts = enc.split(":");
  if (parts.length !== 2) throw new Error("Invalid encrypted password format");
  const iv = Buffer.from(parts[0], "base64");
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGO, k, iv);
  let dec = decipher.update(encrypted, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

const tenantSchema = new mongoose.Schema(
  {
    brand_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    shard_id: {
      type: String,
      required: true,
    },
    rds_proxy_endpoint: {
      type: String,
      required: true,
    },
    database: {
      type: String,
      required: true,
    },
    brand_num: {
      type: Number,
      required: true,
    },
    shop_name: {
      type: String,
      required: true,
    },
    api_version: {
      type: String,
      required: true,
    },
    access_token: {
      type: String,
      required: true,
    },
    session_url: {
      type: String,
      required: false,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      required: true,
    },
    port: {
      type: Number,
      default: 3306,
      required: true,
    },
    user: {
      type: String,
      required: true,
    },
    // stored as base64 iv:ciphertext
    password: {
      type: String,
      required: true,
    },
    speed_key: {
      type: String,
      required: false,
    },
    app_id_mapping: {
      type: String,
      required: false,
      default: "",
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// Pre-save: encrypt plain-text fields if modified and not already encrypted
tenantSchema.pre("save", async function () {
  // Encrypt password
  if (
    this.isModified("password") &&
    this.password &&
    !this.password.toString().includes(":")
  ) {
    this.password = encryptText(this.password.toString());
  }

  // Encrypt access_token
  if (
    this.isModified("access_token") &&
    this.access_token &&
    !this.access_token.toString().includes(":")
  ) {
    this.access_token = encryptText(this.access_token.toString());
  }
});

// Instance method: decrypt using provided key or env var
tenantSchema.methods.getDecryptedPassword = function (key) {
  return decryptText(this.password, key);
};

// Instance method: set password from plain-text and encrypt using provided key or env var
tenantSchema.methods.setPassword = function (plain, key) {
  this.password = encryptText(plain, key);
};

module.exports = mongoose.model("Tenant", tenantSchema);
