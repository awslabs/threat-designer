#======================== Stream Processor (Orphaned Attack Tree Cleanup) ======================

# --- SQS Dead Letter Queue for failed stream records ---

resource "aws_sqs_queue" "stream_processor_dlq" {
  name                      = "${local.prefix}-stream-processor-dlq"
  message_retention_seconds = 1209600 # 14 days
}

# --- IAM Role for Stream Processor Lambda ---

resource "aws_iam_role" "stream_processor_role" {
  name               = "${local.prefix}-stream-processor-role"
  assume_role_policy = templatefile("${path.module}/templates/lambda_trust_policy.json", {})
}

resource "aws_iam_role_policy" "stream_processor_policy" {
  name = "${local.prefix}-stream-processor-policy"
  role = aws_iam_role.stream_processor_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBStreamRead"
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = "${aws_dynamodb_table.threat_designer_state.arn}/stream/*"
      },
      {
        Sid    = "AttackTreeTableDelete"
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.attack_tree_data.arn
      },
      {
        Sid    = "StatusTableDelete"
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.threat_designer_status.arn
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.caller_identity.account_id}:log-group:/aws/lambda/${local.prefix}-stream-processor:*"
      },
      {
        Sid    = "SQSSendToDLQ"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.stream_processor_dlq.arn
      }
    ]
  })
}

# --- Stream Processor Lambda Function ---

locals {
  stream_processor_source_hash = base64sha256(join("", concat(
    [for f in sort(fileset("${path.module}/../backend/stream_processor", "**/*.py")) : filesha256("${path.module}/../backend/stream_processor/${f}")],
    [filesha256("${path.module}/../backend/stream_processor/requirements.txt")]
  )))
}

resource "aws_lambda_function" "stream_processor" {
  description      = "Processes DynamoDB Stream events to clean up orphaned attack trees"
  filename         = data.archive_file.stream_processor_lambda_code_zip.output_path
  source_code_hash = local.stream_processor_source_hash
  function_name    = "${local.prefix}-stream-processor"
  handler          = "index.lambda_handler"
  memory_size      = 256
  role             = aws_iam_role.stream_processor_role.arn
  runtime          = local.python_version
  timeout          = 60

  environment {
    variables = {
      ATTACK_TREE_TABLE = aws_dynamodb_table.attack_tree_data.id
      JOB_STATUS_TABLE  = aws_dynamodb_table.threat_designer_status.id
      LOG_LEVEL         = var.log_level
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [null_resource.build]
}

# --- Event Source Mapping: DynamoDB Stream → Lambda ---

resource "aws_lambda_event_source_mapping" "stream_processor_trigger" {
  event_source_arn                   = aws_dynamodb_table.threat_designer_state.stream_arn
  function_name                      = aws_lambda_function.stream_processor.arn
  starting_position                  = "LATEST"
  batch_size                         = 1
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = false
  maximum_record_age_in_seconds      = -1

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.stream_processor_dlq.arn
    }
  }
}
