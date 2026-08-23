terraform {
  required_version = ">= 0.13.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.23.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 2.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      env    = var.env
      repo   = "threat-design"
      region = "us-east-1"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# The AgentCore web search connector is offered only in us-east-1, eu-west-1 and
# ap-northeast-1, so its gateway may need to live outside var.region.
# See infra/web_search.tf.
provider "aws" {
  alias  = "web_search"
  region = var.web_search_region
}

# terraform {
#   backend "s3" {}
# }


