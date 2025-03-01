# Create Cognito User Pool
resource "aws_cognito_user_pool" "user_pool" {
  name = "${local.prefix}-user-pool"


  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Optional: Configure MFA
  mfa_configuration = "OFF"  # or "ON", "OPTIONAL"

  # Optional: Configure verification
  auto_verified_attributes = ["email"]
  
  # Optional: Configure account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Prevent self-service sign-up
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # Enable hosted UI
  user_pool_add_ons {
    advanced_security_mode = "OFF"
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "${local.prefix}-app-client"
  user_pool_id = aws_cognito_user_pool.user_pool.id

  generate_secret = false

  access_token_validity  = 8
  id_token_validity     = 8
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token     = "hours"
    refresh_token = "days"
  }

  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_scopes                = ["email", "openid", "profile"]
  
  # Using your specific Amplify app domain
  callback_urls = ["https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}"]
  logout_urls   = ["https://${aws_amplify_branch.develop.branch_name}.${aws_amplify_app.threat-designer.default_domain}"]

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
}

# Add random string resource
resource "random_string" "domain_suffix" {
  length  = 6
  special = false
  upper   = false
}

# Create Cognito Domain with random suffix
resource "aws_cognito_user_pool_domain" "domain" {
  domain       = "${local.prefix}-auth-domain-${random_string.domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.user_pool.id
}


resource "random_password" "temp" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
  min_special      = 2
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
}

resource "aws_cognito_user" "example" {
  user_pool_id = aws_cognito_user_pool.user_pool.id
  username     = var.username

  attributes = {
    email          = var.email
    email_verified = true
    given_name     = var.given_name
    family_name    = var.family_name
  }

  temporary_password = random_password.temp.result
}
