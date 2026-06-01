resource "aws_dynamodb_table" "threat_designer_state" {
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "job_id"
  name                        = "${local.prefix}-state"
  deletion_protection_enabled = var.deletion_protection_enabled
  stream_enabled              = true
  stream_view_type            = "NEW_AND_OLD_IMAGES"

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

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
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  name                        = "${local.prefix}-status"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "threat_designer_trail" {
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  name                        = "${local.prefix}-trail"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "threat_designer_sharing" {
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "threat_model_id"
  range_key                   = "user_id"
  name                        = "${local.prefix}-sharing"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

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
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "threat_model_id"
  name                        = "${local.prefix}-locks"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "threat_model_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "threat_designer_backup" {
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "job_id"
  name                        = "${local.prefix}-backup"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "job_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "attack_tree_data" {
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "attack_tree_id"
  name                        = "${local.prefix}-attack-tree-data"
  deletion_protection_enabled = var.deletion_protection_enabled

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

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
