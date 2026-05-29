resource "random_string" "bucket_name" {
  length  = 6
  special = false
  upper   = false
}

resource "aws_s3_bucket" "architecture_bucket" {
  bucket = "${local.prefix}-architecture-${data.aws_caller_identity.caller_identity.account_id}-${random_string.bucket_name.result}"
}

# S3 bucket versioning - protects against accidental overwrites and deletions
resource "aws_s3_bucket_versioning" "architecture_bucket_versioning" {
  bucket = aws_s3_bucket.architecture_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket encryption - encrypts architecture diagrams and threat model data at rest
resource "aws_s3_bucket_server_side_encryption_configuration" "architecture_bucket_encryption" {
  bucket = aws_s3_bucket.architecture_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "architecture_bucket_block" {
  bucket = aws_s3_bucket.architecture_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


resource "aws_s3_bucket_cors_configuration" "architecture_bucket_cors" {
  bucket = aws_s3_bucket.architecture_bucket.id

  cors_rule {
    allowed_headers = [
      "Authorization",
      "X-Amz-Content-Sha256",
      "X-Amz-Date",
      "X-Amz-Security-Token",
      "X-Amz-User-Agent",
      "X-Amz-Copy-Source",
      "X-Amz-Copy-Source-Range",
      "Content-md5",
      "Content-type",
      "Content-Length",
      "Content-Encoding"
    ]
    allowed_methods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "HEAD"
    ]
    allowed_origins = local.allowed_origins
    expose_headers = [
      "ETag",
      "LastModified"
    ]
  }
}
