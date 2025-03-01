resource "aws_dynamodb_table" "threat_designer_state" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "job_id"
  name                        = "${local.prefix}-state"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "job_id"
    type = "S"
  }

  attribute {
    name = "owner"
    type = "S"
  }

  global_secondary_index {
    name               = "owner-job-index"
    hash_key          = "owner"
    range_key         = "job_id"
    projection_type   = "ALL"
  }
}

resource "aws_dynamodb_table" "threat_designer_status" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  name                        = "${local.prefix}-status"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "id"
    type = "S"
  }
}