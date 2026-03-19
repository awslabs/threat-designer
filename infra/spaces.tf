# ── Spaces DynamoDB Tables ────────────────────────────────────────────────────

resource "aws_dynamodb_table" "spaces" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "space_id"
  name                        = "${local.prefix}-spaces"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "space_id"
    type = "S"
  }

  attribute {
    name = "owner"
    type = "S"
  }

  global_secondary_index {
    name            = "owner-index"
    hash_key        = "owner"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "space_sharing" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "space_id"
  range_key                   = "user_id"
  name                        = "${local.prefix}-space-sharing"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "space_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-index"
    hash_key        = "user_id"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "space_documents" {
  #checkov:skip=CKV_AWS_119
  #checkov:skip=CKV_AWS_28
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "space_id"
  range_key                   = "document_id"
  name                        = "${local.prefix}-space-documents"
  deletion_protection_enabled = var.deletion_protection_enabled

  attribute {
    name = "space_id"
    type = "S"
  }

  attribute {
    name = "document_id"
    type = "S"
  }
}

# ── S3 Bucket for Space Documents ─────────────────────────────────────────────

resource "aws_s3_bucket" "spaces_bucket" {
  bucket = "${local.prefix}-spaces-${data.aws_caller_identity.caller_identity.account_id}-${random_string.bucket_name.result}"
}

resource "aws_s3_bucket_public_access_block" "spaces_bucket_block" {
  bucket = aws_s3_bucket.spaces_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "spaces_bucket_cors" {
  bucket = aws_s3_bucket.spaces_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = local.allowed_origins
    expose_headers  = ["ETag"]
  }
}

# ── S3 Vectors (vector store for KB) ──────────────────────────────────────────

resource "aws_s3vectors_vector_bucket" "spaces_kb_vector_bucket" {
  vector_bucket_name = "${local.prefix}-kb-vectors"
}

resource "aws_s3vectors_index" "spaces_kb_index" {
  vector_bucket_name = aws_s3vectors_vector_bucket.spaces_kb_vector_bucket.vector_bucket_name
  index_name         = "${local.prefix}-kb-index"
  data_type          = "float32"
  dimension          = 1024
  distance_metric    = "euclidean"

  metadata_configuration {
    non_filterable_metadata_keys = ["AMAZON_BEDROCK_TEXT", "AMAZON_BEDROCK_METADATA"]
  }
}

# ── Bedrock Knowledge Base ─────────────────────────────────────────────────────

resource "aws_iam_role" "knowledge_base_role" {
  name = "${local.prefix}-kb-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.caller_identity.account_id
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "knowledge_base_policy" {
  name = "${local.prefix}-kb-policy"
  role = aws_iam_role.knowledge_base_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.spaces_bucket.arn,
          "${aws_s3_bucket.spaces_bucket.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3VectorsAccess"
        Effect = "Allow"
        Action = [
          "s3vectors:PutVectors",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:ListVectors",
        ]
        Resource = [
          aws_s3vectors_vector_bucket.spaces_kb_vector_bucket.vector_bucket_arn,
          "${aws_s3vectors_vector_bucket.spaces_kb_vector_bucket.vector_bucket_arn}/*",
        ]
      }
    ]
  })
}

resource "aws_bedrockagent_knowledge_base" "spaces_kb" {
  name     = "${local.prefix}-spaces-kb"
  role_arn = aws_iam_role.knowledge_base_role.arn

  knowledge_base_configuration {
    type = "VECTOR"
    vector_knowledge_base_configuration {
      embedding_model_arn = "arn:aws:bedrock:${var.region}::foundation-model/${var.kb_embedding_model_id}"
    }
  }

  storage_configuration {
    type = "S3_VECTORS"
    s3_vectors_configuration {
      index_arn = aws_s3vectors_index.spaces_kb_index.index_arn
    }
  }

  depends_on = [
    aws_iam_role_policy.knowledge_base_policy,
    aws_s3vectors_index.spaces_kb_index,
  ]
}

resource "aws_bedrockagent_data_source" "spaces_kb_data_source" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.spaces_kb.id
  name              = "${local.prefix}-spaces-kb-s3"

  data_source_configuration {
    type = "S3"
    s3_configuration {
      bucket_arn = aws_s3_bucket.spaces_bucket.arn
    }
  }
}

# ── IAM additions for existing roles ──────────────────────────────────────────

# Allow backend Lambda to manage spaces tables, spaces bucket, and trigger KB ingestion
resource "aws_iam_role_policy" "backend_spaces_policy" {
  name = "${local.prefix}-backend-spaces-policy"
  role = aws_iam_role.threat_designer_api_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.spaces.arn,
          "${aws_dynamodb_table.spaces.arn}/*",
          aws_dynamodb_table.space_sharing.arn,
          "${aws_dynamodb_table.space_sharing.arn}/*",
          aws_dynamodb_table.space_documents.arn,
          "${aws_dynamodb_table.space_documents.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.spaces_bucket.arn, "${aws_s3_bucket.spaces_bucket.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:StartIngestionJob", "bedrock-agent:StartIngestionJob", "bedrock:ListIngestionJobs", "bedrock-agent:ListIngestionJobs"]
        Resource = [
          aws_bedrockagent_knowledge_base.spaces_kb.arn,
          "${aws_bedrockagent_knowledge_base.spaces_kb.arn}/*",
        ]
      }
    ]
  })
}

# Allow agent runtime to query the Knowledge Base
resource "aws_iam_role_policy" "agent_kb_policy" {
  name = "${local.prefix}-agent-kb-policy"
  role = aws_iam_role.threat_designer_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["bedrock:Retrieve", "bedrock-agent-runtime:Retrieve"]
        Resource = [aws_bedrockagent_knowledge_base.spaces_kb.arn]
      }
    ]
  })
}

# ── Outputs ────────────────────────────────────────────────────────────────────

output "spaces_kb_id" {
  value = aws_bedrockagent_knowledge_base.spaces_kb.id
}

output "spaces_kb_data_source_id" {
  value = aws_bedrockagent_data_source.spaces_kb_data_source.data_source_id
}

output "spaces_bucket_id" {
  value = aws_s3_bucket.spaces_bucket.id
}
