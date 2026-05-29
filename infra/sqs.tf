# SQS Dead Letter Queue for Lambda functions
# Captures failed asynchronous invocations for debugging and retry
resource "aws_sqs_queue" "lambda_dlq" {
  name                      = "${local.prefix}-lambda-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${local.prefix}-lambda-dlq"
  }
}

# IAM policy to allow Lambda to send messages to DLQ
resource "aws_iam_role_policy" "lambda_dlq_policy" {
  name = "${local.prefix}-lambda-dlq-policy"
  role = aws_iam_role.threat_designer_api_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.lambda_dlq.arn
      }
    ]
  })
}
