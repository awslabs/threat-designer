resource "random_string" "bucket_name" {
  length  = 6
  special = false
  upper   = false
}

resource "aws_s3_bucket" "architecture_bucket" {
  bucket = "${local.prefix}-architecture-${data.aws_caller_identity.caller_identity.account_id}-${random_string.bucket_name.result}"
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