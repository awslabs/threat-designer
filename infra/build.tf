resource "null_resource" "build" {
  triggers = {
    always_run = "${timestamp()}"  # This ensures it runs on every apply
  }

  provisioner "local-exec" {
    command = "bash ${path.module}/build.sh"
    working_dir = path.module  # Ensures script runs from the infrastructure directory
  }
}

data "archive_file" "backend_lambda_code_zip" {
  type        = "zip"
  source_dir  = "build/backend_code"
  output_path = "build/backend.zip"

  depends_on = [null_resource.build]
}

data "archive_file" "authorizer_lambda_code_zip" {
  type        = "zip"
  source_dir  = "build/authorizer_code"
  output_path = "build/authorizer.zip"

  depends_on = [null_resource.build]
}


data "archive_file" "td_lambda_code_zip" {
  type        = "zip"
  source_dir  = "build/threat_designer_code"
  output_path = "build/threat_designer.zip"

  depends_on = [null_resource.build]
}


data "archive_file" "lambda_layer_langchain" {
  type        = "zip"
  source_dir  = "build/langchain_code"
  output_path = "build/langchain.zip"

  depends_on = [null_resource.build]
}

# Create zip file from local data
data "archive_file" "lambda_layer_authorization" {
  type        = "zip"
  source_dir  = "build/authorization_deps_code"
  output_path = "build/authorization_deps.zip"

  depends_on = [null_resource.build]
}

# # Create zip file from local data
# data "archive_file" "lambda_layer_backend" {
#   type        = "zip"
#   source_dir  = "build/backend_deps_code"
#   output_path = "build/backend_deps.zip"

#   depends_on = [null_resource.build]
# }