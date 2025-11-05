terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  prefix   = var.project
  db_name  = "${var.project}_db"
  wg_name  = "${var.project}_wg"
  firehose = "${var.project}-firehose"
}

# ---------------- S3 bucket for raw data ----------------
resource "aws_s3_bucket" "data" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "block" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "own" {
  bucket = aws_s3_bucket.data.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "lc" {
  bucket = aws_s3_bucket.data.id
  rule {
    id     = "expire-${var.retention_days}d"
    status = "Enabled"
    expiration { days = var.retention_days }
    filter {}
  }
}

# ---------------- Glue database (for Athena) ----------------
resource "aws_glue_catalog_database" "db" {
  name = local.db_name
}

# ---------------- IAM for Firehose ----------------
data "aws_iam_policy_document" "assume_firehose" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose_role" {
  name               = "${local.prefix}-firehose-role"
  assume_role_policy = data.aws_iam_policy_document.assume_firehose.json
}

data "aws_iam_policy_document" "firehose_to_s3" {
  statement {
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:PutObject"
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*"
    ]
  }

  # Firehose delivery logging
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "firehose_policy" {
  name   = "${local.prefix}-firehose-s3"
  policy = data.aws_iam_policy_document.firehose_to_s3.json
}

resource "aws_iam_role_policy_attachment" "firehose_attach" {
  role       = aws_iam_role.firehose_role.name
  policy_arn = aws_iam_policy.firehose_policy.arn
}

# ---------------- Firehose: DirectPut → S3 with dynamic partitioning ----------------
resource "aws_kinesis_firehose_delivery_stream" "to_s3" {
  name        = local.firehose
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn           = aws_iam_role.firehose_role.arn
    bucket_arn         = aws_s3_bucket.data.arn
    compression_format = "GZIP"
    buffering_size     = var.buffer_size_mb
    buffering_interval = var.buffer_interval

    dynamic_partitioning_configuration {
      enabled = true
    }

    # Uses extracted 'collection' and 'brand' + server time
    prefix              = "collection=!{partitionKeyFromQuery:collection}/brand_id=!{partitionKeyFromQuery:brand}/dt=!{timestamp:yyyy/MM/dd}/hour=!{timestamp:HH}/"
    error_output_prefix = "errors/!{firehose:error-output-type}/dt=!{timestamp:yyyy/MM/dd}/hour=!{timestamp:HH}/"

    processing_configuration {
      enabled = true

      processors {
        type = "MetadataExtraction"
        parameters {
          parameter_name  = "MetadataExtractionQuery"
          parameter_value = "{collection:.coll, brand:.brand_id}"
        }
        parameters {
          parameter_name  = "JsonParsingEngine"
          parameter_value = "JQ-1.6"
        }
      }
    }
  }
}

# ---------------- Athena workgroup ----------------
resource "aws_athena_workgroup" "wg" {
  name = local.wg_name
  configuration {
    enforce_workgroup_configuration = false
    result_configuration {
      output_location = "s3://${aws_s3_bucket.data.bucket}/athena-results/"
    }
  }
}

# ---------------- Optional Athena (Glue) table over JSON with partition projection ----------------
resource "aws_glue_catalog_table" "events_json" {
  count         = var.create_athena_table ? 1 : 0
  name          = "events_json"
  database_name = aws_glue_catalog_database.db.name
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    "classification"                = "json"
    "compressionType"               = "gzip"
    "projection.enabled"            = "true"
    "projection.collection.type"    = "enum"
    "projection.collection.values"  = "events,sessions"
    "projection.brand_id_part.type" = "injected"
    "projection.dt.type"            = "date"
    "projection.dt.range"           = "2025/01/01,NOW"
    "projection.dt.format"          = "yyyy/MM/dd"
    "projection.hour.type"          = "integer"
    "projection.hour.range"         = "00,23"
    # Escape ${...} for Glue so Terraform doesn’t interpolate it
    "storage.location.template" = "s3://${aws_s3_bucket.data.bucket}/collection=$${collection}/brand_id=$${brand_id_part}/dt=$${dt}/hour=$${hour}/"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.data.bucket}/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    # NOTE: provider v5 expects ser_de_info (not serde_info)
    ser_de_info {
      name                  = "json"
      serialization_library = "org.openx.data.jsonserde.JsonSerDe"
      parameters = {
        "ignore.malformed.json" = "true"
      }
    }

    # ---- columns (multi-line blocks) ----
    columns {
      name = "brand_id"
      type = "string"
    }
    columns {
      name = "event_id"
      type = "string"
    }
    columns {
      name = "session_id"
      type = "string"
    }
    columns {
      name = "event_name"
      type = "string"
    }
    columns {
      name = "occurred_at"
      type = "string"
    }
    columns {
      name = "url"
      type = "string"
    }
    columns {
      name = "referrer"
      type = "string"
    }
    columns {
      name = "user_agent"
      type = "string"
    }
    columns {
      name = "client_id"
      type = "string"
    }
    columns {
      name = "visitor_id"
      type = "string"
    }
    columns {
      name = "raw"
      type = "string"
    }
    columns {
      name = "coll"
      type = "string"
    }
  }

  # ---- partition keys (multi-line blocks) ----
  partition_keys {
    name = "collection"
    type = "string"
  }
  partition_keys {
    name = "brand_id_part"
    type = "string"
  }
  partition_keys {
    name = "dt"
    type = "string"
  }
  partition_keys {
    name = "hour"
    type = "string"
  }
}


# ---------------- Outputs ----------------
output "s3_bucket" { value = aws_s3_bucket.data.bucket }
output "firehose_stream" { value = aws_kinesis_firehose_delivery_stream.to_s3.name }
output "glue_database" { value = aws_glue_catalog_database.db.name }
output "athena_workgroup" { value = aws_athena_workgroup.wg.name }
output "athena_table" { value = try(aws_glue_catalog_table.events_json[0].name, null) }
