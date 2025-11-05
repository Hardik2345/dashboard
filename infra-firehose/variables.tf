variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "shopdash"
}

# Must be globally unique across S3
variable "bucket_name" {
  type    = string
  default = "shopdash-events-CHANGE-ME-unique"
}

variable "retention_days" {
  type    = number
  default = 180
}

# Firehose buffering before it writes to S3
variable "buffer_size_mb" {
  type    = number
  default = 64
}

variable "buffer_interval" {
  type    = number
  default = 60
}

# Optional: create an Athena table with partition projection
variable "create_athena_table" {
  type    = bool
  default = true
}
