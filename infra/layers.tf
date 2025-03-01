
# Create Lambda layer
resource "aws_lambda_layer_version" "lambda_layer_langchain" {
  filename            = data.archive_file.lambda_layer_langchain.output_path
  source_code_hash = data.archive_file.lambda_layer_langchain.output_base64sha256
  layer_name         = "${local.prefix}-langchain-layer"
  description        = "Langachain lambda layer"
  compatible_runtimes = ["python3.12"] 

  compatible_architectures = ["x86_64"]
}


# Create Lambda layer
resource "aws_lambda_layer_version" "lambda_layer_authorization" {
  filename            = data.archive_file.lambda_layer_authorization.output_path
  source_code_hash = data.archive_file.lambda_layer_authorization.output_base64sha256
  layer_name         = "${local.prefix}-authorization-layer"
  description        = "Langachain lambda layer"
  compatible_runtimes = ["python3.12"] 

  compatible_architectures = ["x86_64"]
}


# # Create Lambda layer
# resource "aws_lambda_layer_version" "lambda_layer_backend" {
#   filename            = data.archive_file.lambda_layer_backend.output_path
#   layer_name         = "${local.prefix}-backend-layer"
#   description        = "Langachain lambda layer"
#   compatible_runtimes = ["python3.12"] 

#   compatible_architectures = ["x86_64"]
# }