resource "aws_dynamodb_table" "threat_designer_state" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "job_id"
  name                        = "${local.prefix}-state"
  deletion_protection_enabled = var.deletion_protection_enabled

  # Schema includes additional attributes for collaboration (not defined in Terraform):
  # - shared_with: Map of user_id to access_level (e.g., {"user@example.com": "EDIT"})
  # - is_shared: Boolean flag indicating if threat model is shared
  # - last_modified_by: User ID of last person to modify the threat model
  # - last_modified_at: ISO timestamp of last modification

  attribute {
    name = "job_id"
    type = "S"
  }

  attribute {
    name = "owner"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "owner-job-index"
    hash_key        = "owner"
    range_key       = "job_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "owner-timestamp-index"
    hash_key        = "owner"
    range_key       = "timestamp"
    projection_type = "ALL"
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

resource "aws_dynamodb_table" "threat_designer_trail" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  name                        = "${local.prefix}-trail"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "threat_designer_sharing" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "threat_model_id"
  range_key                   = "user_id"
  name                        = "${local.prefix}-sharing"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "threat_model_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "owner"
    type = "S"
  }

  attribute {
    name = "shared_at"
    type = "S"
  }

  global_secondary_index {
    name            = "owner-index"
    hash_key        = "owner"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "user-index"
    hash_key        = "user_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "user-timestamp-index"
    hash_key        = "user_id"
    range_key       = "shared_at"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "threat_designer_locks" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "threat_model_id"
  name                        = "${local.prefix}-locks"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "threat_model_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "attack_tree_data" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "attack_tree_id"
  name                        = "${local.prefix}-attack-tree-data"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "attack_tree_id"
    type = "S"
  }

  attribute {
    name = "threat_model_id"
    type = "S"
  }

  global_secondary_index {
    name            = "threat_model_id-index"
    hash_key        = "threat_model_id"
    projection_type = "ALL"
  }
}