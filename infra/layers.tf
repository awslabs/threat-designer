# S3 bucket for Lambda artifacts
resource "aws_s3_bucket" "lambda_artifacts" {
  bucket = "${local.prefix}-lambda-artifacts-${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

locals {
  # Hash authorization layer dependencies to detect actual changes
  authorization_layer_hash = base64sha256(join("", [
    filesha256("${path.module}/../backend/dependencies/requirements-authorizer.txt")
  ]))
}


resource "aws_s3_object" "authorization_layer_zip" {
  bucket = aws_s3_bucket.lambda_artifacts.bucket
  key    = "layers/authorization-${local.authorization_layer_hash}.zip"
  source = data.archive_file.lambda_layer_authorization.output_path
  etag   = local.authorization_layer_hash

  depends_on = [data.archive_file.lambda_layer_authorization]
}


# Create Lambda layer using S3
resource "aws_lambda_layer_version" "lambda_layer_authorization" {
  s3_bucket                = aws_s3_bucket.lambda_artifacts.bucket
  s3_key                   = aws_s3_object.authorization_layer_zip.key
  source_code_hash         = local.authorization_layer_hash
  layer_name               = "${local.prefix}-authorization-layer"
  description              = "Authorization lambda layer"
  compatible_runtimes      = ["python3.12"]
  compatible_architectures = ["x86_64"]
}