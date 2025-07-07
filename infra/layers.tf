# S3 bucket for Lambda artifacts
resource "aws_s3_bucket" "lambda_artifacts" {
  bucket = "${local.prefix}-lambda-artifacts-${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Upload Lambda layer zip files to S3
resource "aws_s3_object" "langchain_layer_zip" {
  bucket = aws_s3_bucket.lambda_artifacts.bucket
  key    = "layers/langchain-${data.archive_file.lambda_layer_langchain.output_base64sha256}.zip"
  source = data.archive_file.lambda_layer_langchain.output_path
  etag   = data.archive_file.lambda_layer_langchain.output_md5

  depends_on = [data.archive_file.lambda_layer_langchain]
}

resource "aws_s3_object" "authorization_layer_zip" {
  bucket = aws_s3_bucket.lambda_artifacts.bucket
  key    = "layers/authorization-${data.archive_file.lambda_layer_authorization.output_base64sha256}.zip"
  source = data.archive_file.lambda_layer_authorization.output_path
  etag   = data.archive_file.lambda_layer_authorization.output_md5

  depends_on = [data.archive_file.lambda_layer_authorization]
}



# Create Lambda layer using S3
resource "aws_lambda_layer_version" "lambda_layer_langchain" {
  s3_bucket           = aws_s3_bucket.lambda_artifacts.bucket
  s3_key              = aws_s3_object.langchain_layer_zip.key
  s3_object_version   = aws_s3_object.langchain_layer_zip.version_id
  source_code_hash    = data.archive_file.lambda_layer_langchain.output_base64sha256
  layer_name          = "${local.prefix}-langchain-layer"
  description         = "Langchain lambda layer"
  compatible_runtimes = ["python3.12"]
  compatible_architectures = ["x86_64"]
}

# Create Lambda layer using S3
resource "aws_lambda_layer_version" "lambda_layer_authorization" {
  s3_bucket           = aws_s3_bucket.lambda_artifacts.bucket
  s3_key              = aws_s3_object.authorization_layer_zip.key
  s3_object_version   = aws_s3_object.authorization_layer_zip.version_id
  source_code_hash    = data.archive_file.lambda_layer_authorization.output_base64sha256
  layer_name          = "${local.prefix}-authorization-layer"
  description         = "Authorization lambda layer"
  compatible_runtimes = ["python3.12"]
  compatible_architectures = ["x86_64"]
}