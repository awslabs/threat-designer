<p align="center">
  <img src="assets/logo.png" alt="Threat Designer Logo" width="200"/>
</p>

# Threat Designer: AI-powered threat modeling for secure system design

> Check the blogpost: [Accelerate threat modeling with generative AI](https://aws.amazon.com/blogs/machine-learning/accelerate-threat-modeling-with-generative-ai/) for an in-depth overview of the solution.

## Architecture diagram

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/threat_designer_arch_dark.png">
  <img alt="solutions_diagram" src="./assets/threat_designer_arch.png">
</picture>

## Agent logic

<p align="center">
  <img src="assets/agent-flow.png" alt="Threat Designer Logo" width="300"/>
</p>

## Description

Threat Designer is an AI-driven agent designed to automate and streamline the threat modeling process for secure system design.

Harnessing the power of large language models (LLMs), it analyzes system architectures, identifies potential security threats, and generates detailed threat models. By automating this complex and time-intensive task, Threat Designer empowers developers and security professionals to seamlessly incorporate security considerations from the earliest stages of development, enhancing both efficiency and system resilience.

The project deploys resources running on the following AWS services:

- AWS Amplify
- Amazon API Gateway
- Amazon Cognito
- AWS Lambda
- Amazon Bedrock AgentCore Runtime
- Amazon DynamodB Tables
- Amazon S3 Bucket

## Support the Project

If you find Threat Designer useful, please consider supporting the project. ⭐ Star the repository on GitHub to help more people discover the tool.

## Features

> **Note:** Check the [Quick start guide](./quick-start-guide/quick-start.md) to familiarize with Threat Designer features and capabilities.

- Submit architecture diagrams and analyze for threats.
- Update threat modeling results via the user interface.
- Replay threat modeling based on your edits and additional input.
- Export results in pdf/docx/json format.
- Interact with Sentry (built-in assistant) to dive deep in the threat model.
- Explore past threat models via the `Threat Catalog` page.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/sign_in_dark.png">
  <img alt="sign in" src="./assets/sign_in.png" style="margin-bottom: 20px;">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/wizard_dark.png">
  <img alt="wizard" src="./assets/wizard.png" style="margin-bottom: 20px;">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/processing_dark.png">
  <img alt="processing" src="./assets/processing.png" style="margin-bottom: 20px;">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/threat_catalog_dark.png">
  <img alt="threat catalog" src="./assets/threat_catalog.png" style="margin-bottom: 20px;">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/sentry_dark.png">
  <img alt="sentry" src="./assets/sentry.png">
</picture>

## Prerequisites

The following tools must be installed on your local machine:

- [Node.js](https://nodejs.org/en/download) (v18 or later) and npm
- [curl](https://curl.se/)
- [jq](https://jqlang.org/download/)
- [Python](https://www.python.org/downloads/) (v3.12 or later) and pip
- [Terraform CLI](https://developer.hashicorp.com/terraform/install)
- [AWS CLI](https://docs.aws.amazon.com/cli/v1/userguide/cli-chap-install.html) configured with [appropriate credentials](https://docs.aws.amazon.com/cli/v1/userguide/cli-chap-configure.html)

### AWS Bedrock Model Access

You must enable access to the following models in your AWS region:

- **Claude 4.5 Sonnet**
- **Claude 4.5 Haiku**

> **Note:** The default configuration uses a combination of these two models. You free to update it according to your preferences. [See Model Selection](#model-selection) for more information.

To enable Claude, follow the instructions [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access-modify.html).

## Installation and Deployment

1. Clone the Repository

```bash
git clone https://github.com/awslabs/threat-designer.git
cd threat-designer
```

2. Make the deployment script executable:

```bash
chmod +x deployment.sh
```

3. Export AWS credentials

```bash
# Option I: Export AWS temporary credentials
export AWS_ACCESS_KEY_ID="your_temp_access_key"
export AWS_SECRET_ACCESS_KEY="your_temp_secret_key"
export AWS_SESSION_TOKEN="your_temp_session_token"
export AWS_DEFAULT_REGION="your_region"

# Option II: Export AWS Profile
export AWS_PROFILE="your_profile_name"
```

4. Deploy with required parameters:

> **Note:** Make sure to provide a valid email address during the deployment wizard. A user in Amazon Cognito User Pool will be created and the temporary credentials will be sent to the configured email address.

```bash
./deployment.sh
```

## Accessing the Application

After successful deployment, you can find the Login URL in the output of `./deployment`:

```sh
Application Login page: https://dev.xxxxxxxxxxxxxxxx.amplifyapp.com
```

## Configuration Options

### Model Selection

> **Note:** If you deploy the solution in a different region from the US ones verify the interence profile id of the model for that particular region. Check [Supported Regions and models for inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html) documentation for more information.

If you want to use a different model, update the variables **model_main** and **model_struct** in `./infra/variables.tf` with the correct [model ID](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns), max_token and reasoning_budget configuration:

```hcl
variable "model_main" {

...

  default = {
    assets = {
      id = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 16000
        "2" = 32000
        "3" = 63999
      }
    }
    flows = {
      id = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 8000
        "2" = 16000
        "3" = 24000
      }
    }
    threats = {
      id = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 24000
        "2" = 48000
        "3" = 63999
      }
    }
    gaps = {
      id = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
      max_tokens = 64000
      reasoning_budget = {
        "1" = 4000
        "2" = 8000
        "3" = 12000
      }
    }
  }
}

variable "model_struct" {
  type = object({
    id          = string
    max_tokens  = number
  })
  default = {
    id          = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens  = 64000
  }
}
```

> **Reasoning boost** will only work with Anthropic's models starting from **Claude Sonnet 3.7**

### Sentry AI Assistant (Optional Feature)

Sentry is an AI-powered assistant that helps you analyze and explore threat models through conversational interaction. This feature is **optional** and can be enabled or disabled during deployment.

#### Enabling/Disabling Sentry During Deployment

When you run `./deployment.sh`, you will be prompted:

```
Enable Sentry AI Assistant? (y/n, default: y)
```

- **Enable (y)**: Deploys the full Sentry infrastructure including AWS Bedrock AgentCore Runtime, DynamoDB session table, and ECR repository. The Assistant drawer will be available in the UI.
- **Disable (n)**: Skips Sentry infrastructure deployment. The Assistant drawer will be hidden from the UI, and core threat modeling features will continue to work normally.

#### Toggling Sentry in Existing Deployments

**To disable Sentry in an existing deployment:**


1. Update the `.deployment.config` file in the project root:
```bash
ENABLE_SENTRY=false
```

2. Redeploy the solution

**To enable Sentry in a deployment where it was disabled:**

1. Update the `.deployment.config` file in the project root:
```bash
ENABLE_SENTRY=false
```

2. Redeploy the solution

> **Note:** When toggling Sentry, ensure both the infrastructure (Terraform) and frontend configuration (`.env` file) are updated to maintain consistency.

## Clean up

1. Empty the **Architecture Bucket**, following instructions [here](https://docs.aws.amazon.com/AmazonS3/latest/userguide/empty-bucket.html)

2. Make the destroy script executable:

```bash
chmod +x destroy.sh
```

3. Export AWS credentials

```bash
# Option I: Export AWS temporary credentials
export AWS_ACCESS_KEY_ID="your_temp_access_key"
export AWS_SECRET_ACCESS_KEY="your_temp_secret_key"
export AWS_SESSION_TOKEN="your_temp_session_token"
export AWS_DEFAULT_REGION="your_region"

# Option II: Export AWS Profile
export AWS_PROFILE="your_profile_name"

```

4. Execute the script:

```bash
./destroy.sh
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the Apache License. See the [LICENSE](LICENSE) file.
