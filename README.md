# Lightning Mode Quick Start Guide

## Table of Contents

- [What is Lightning Mode?](#what-is-lightning-mode)
  - [How Lightning Mode Works](#how-lightning-mode-works)
  - [Lightning Mode vs Full Deployment](#lightning-mode-vs-full-deployment)
  - [Feature Limitations](#feature-limitations)
  - [Data Persistence Model](#data-persistence-model)
- [Prerequisites](#prerequisites)
  - [AI Provider Access](#1-ai-provider-access)
  - [Enable Model Access](#2-enable-model-access)
  - [Credentials](#3-credentials)
  - [Modern Web Browser](#4-modern-web-browser)
- [Getting Started](#getting-started)
  - [Step 1: Access Lightning Mode](#step-1-access-lightning-mode)
  - [Step 2: Configure AI Provider Credentials](#step-2-configure-ai-provider-credentials)
  - [Step 3: Submit Your First Threat Model](#step-3-submit-your-first-threat-model)
  - [Step 4: Review Results](#step-4-review-results)
- [Security Considerations](#security-considerations)
  - [Amazon Bedrock Credentials](#aws-bedrock-credentials)
  - [OpenAI API Key Security](#openai-api-key-security)
  - [Best Practices Checklist](#best-practices-checklist)

---

## What is Lightning Mode?

Lightning mode is a lightweight, browser-based version of Threat Designer that provides instant access to core AI-powered threat modeling capabilities without requiring any backend infrastructure deployment. It's designed for quick evaluations, demonstrations, and situations where you need immediate threat modeling capabilities.

### How Lightning Mode Works

Lightning mode runs entirely in your web browser using either Amazon Bedrock or OpenAI's GPT models. All data is stored temporarily in your browser's session storage, making it a stateless solution that requires no server infrastructure, databases, or persistent storage.

### Lightning Mode vs Full Deployment

| Feature                     | Lightning Mode                                   | Full Deployment                                 |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| **Infrastructure Required** | None - runs in browser                           | AWS infrastructure (Lambda, DynamoDB, S3, etc.) |
| **Setup Time**              | Instant - just AWS credentials or OpenAI API key | 15-30 minutes deployment                        |
| **Data Persistence**        | Session only (lost when tab closes)              | Permanent storage in DynamoDB and S3            |
| **Sentry AI Assistant**     | ❌ Not available                                 | ✅ Available                                    |
| **Threat Catalog**          | ❌ Not available                                 | ✅ Available                                    |
| **Core Threat Modeling**    | ✅ Available                                     | ✅ Available                                    |
| **Architecture Analysis**   | ✅ Available                                     | ✅ Available                                    |
| **Export (PDF/DOCX/JSON)**  | ✅ Available                                     | ✅ Available                                    |
| **AI Provider Options**     | Amazon Bedrock or OpenAI                         | Amazon Bedrock or OpenAI                        |
| **Best For**                | Evaluation, demos, quick assessments             | Production use, team collaboration              |

### Feature Limitations

Lightning mode focuses on core threat modeling functionality. The following features are **not available** in Lightning mode:

- **Sentry AI Assistant**: The conversational AI assistant for exploring threat models is not included
- **Threat Catalog**: Historical threat model storage and browsing is not available
- **Persistent Storage**: Threat models are not saved permanently and will be lost when you close the browser tab

### Data Persistence Model

Lightning mode uses your browser's **sessionStorage** for temporary data storage:

- **Temporary**: Data exists only for the current browser tab session
- **Automatic Cleanup**: All data is automatically cleared when you close the browser tab
- **No Server Storage**: Nothing is stored on any server (except your credentials are used to call your chosen AI provider)
- **Export Before Closing**: Always export your threat model (PDF, DOCX, or JSON) before closing the tab if you want to keep it

## Prerequisites

Before using Lightning mode, ensure you have one of the following AI provider setups:

### 1. AI Provider Access

You need access to **either** Amazon Bedrock **or** OpenAI's API (not both simultaneously):

#### Option A: Amazon Bedrock

- AWS account with access to Amazon Bedrock in a supported region
- Lightning mode uses the following models:
  - **Claude 4.5 Haiku** - Used for asset identification and threat analysis
  - **Claude 4.5 Sonnet** - Used for flow analysis and gap identification

#### Option B: OpenAI API

- OpenAI API account with access to GPT models
- Lightning mode uses the following models:
  - **GPT-5** - Used for flow analysis and gap identification
  - **GPT-5 Mini** - Used for asset identification and threat analysis

### 2. Enable Model Access

#### For Amazon Bedrock:

Ensure you have enabled access to Claude models in your Amazon Bedrock console for your chosen region.

#### For OpenAI:

Ensure your OpenAI API account has sufficient credits and access to GPT-5 models.

### 3. Credentials

#### For Amazon Bedrock:

AWS credentials with permissions to invoke Bedrock models. See the [Amazon Bedrock Credentials](#aws-bedrock-credentials) section for recommended credential types and IAM policies.

#### For OpenAI:

A valid OpenAI API key with access to GPT models. See the [OpenAI API Key Security](#openai-api-key-security) section for security considerations.

### 4. Modern Web Browser

Lightning mode works with modern web browsers that support:

- ES6+ JavaScript
- sessionStorage API
- Fetch API

Recommended browsers:

- Chrome/Edge (version 90+)
- Firefox (version 88+)
- Safari (version 14+)

## Getting Started

### Step 1: Access Lightning Mode

Navigate to the Lightning mode application URL in your web browser.

### Step 2: Configure AI Provider Credentials

On the login page, you'll see options to choose your AI provider:

#### Option A: Amazon Bedrock Configuration

Select "Amazon Bedrock" and provide:

1. **AWS Access Key ID** (required)
2. **AWS Secret Access Key** (required)
3. **AWS Session Token** (optional - required only for temporary credentials)
4. **AWS Region** (required - select the region where you have Bedrock access)

#### Option B: OpenAI Configuration

Select "OpenAI" and provide:

1. **OpenAI API Key** (required)

**Important**: Your credentials are stored only in your browser's memory and are never sent to any other server except your chosen AI provider.

### Step 3: Submit Your First Threat Model

Once authenticated with your chosen AI provider:

1. Click **"Start New Threat Model"** or navigate to the threat modeling wizard
2. **Upload Architecture Diagram**: Provide a diagram of your system architecture (PNG, JPG, or PDF)
3. **Enter Project Details**:
   - Project name
   - Description (optional but recommended)
4. **Configure Analysis Settings**:
   - **Iteration Count**: Choose 1-3 iterations (more iterations = more thorough analysis but longer processing time)
   - **Reasoning Boost**: Select reasoning level (1-3) for deeper AI analysis
5. Click **"Submit"** to start the analysis

### Step 4: Review Results

After processing completes (typically 15-30 minutes depending on settings):

1. Review the generated threat model organized by STRIDE categories
2. Examine identified **Assets**, **Flows**, **Trust Boundaries**, and **Threats**
3. Edit, add, or remove entries as needed
4. **Export your results** before closing the browser tab:
   - PDF format for reports
   - DOCX format for editing
   - JSON format for programmatic use

## Security Considerations

Security is paramount when working with AI provider credentials. Follow these best practices based on your chosen provider.

### Amazon Bedrock Credentials

#### Use Short-Lived Credentials (Strongly Recommended)

**Always prefer temporary credentials over long-term IAM user credentials.** Short-lived credentials automatically expire, reducing the risk of credential compromise.

##### Recommended Credential Types (in order of preference):

1. **AWS IAM Identity Center (SSO) Credentials**
   - Automatically expire after a few hours
   - Centrally managed
   - Best for enterprise environments

2. **AWS STS Temporary Credentials**
   - Generated using `aws sts assume-role` or `aws sts get-session-token`
   - Configurable expiration (15 minutes to 12 hours)
   - Ideal for individual use

3. **IAM User Credentials** (Not Recommended)
   - Long-lived credentials that don't expire
   - Higher security risk if compromised
   - Only use if temporary credentials are not available

##### How to Generate Temporary Credentials

Using AWS CLI to generate temporary credentials:

```bash
# Generate temporary credentials (valid for 1 hour)
aws sts get-session-token --duration-seconds 3600

# Output will include:
# - AccessKeyId
# - SecretAccessKey
# - SessionToken (required for temporary credentials)
# - Expiration timestamp
```

#### IAM Policy Scoping

Create a dedicated IAM policy with minimal permissions for Lightning mode. The policy should grant access **only** to Amazon Bedrock model invocation.

##### Minimal IAM Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockModelInvokeOnly",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
        "arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-*"
      ]
    }
  ]
}
```

This policy:

- ✅ Allows invoking Claude models in any region
- ✅ Follows principle of least privilege
- ❌ Does not grant access to other AWS services
- ❌ Does not grant write permissions
- ❌ Does not grant access to non-Claude models

### OpenAI API Key Security

#### API Key Management

- **Dedicated Keys**: Create a dedicated API key specifically for Lightning mode usage
- **Usage Monitoring**: Regularly monitor your OpenAI usage and billing to detect any anomalies
- **Rate Limits**: Be aware of your API rate limits to avoid service interruptions
- **Key Rotation**: Regularly rotate your API keys as a security best practice
- **Usage Limits**: Set appropriate usage limits on your API keys to prevent unexpected charges

### Best Practices Checklist

#### For Amazon Bedrock:

- ✅ Use temporary credentials with short expiration times (1-4 hours)
- ✅ Create a dedicated IAM policy with minimal Bedrock permissions
- ✅ Use a dedicated IAM user or role for Lightning mode (don't reuse admin credentials)
- ✅ Regularly rotate IAM user access keys if using long-term credentials

#### For OpenAI:

- ✅ Use dedicated API keys for Lightning mode
- ✅ Monitor API usage and billing regularly
- ✅ Set appropriate usage limits on your API keys
- ✅ Rotate API keys regularly as a security best practice

#### Universal Best Practices:

- ✅ Clear credentials when finished using the application
- ✅ Close the browser tab when done to ensure credentials are cleared from memory
- ✅ Export your threat model before closing the browser tab
- ❌ Never share your credentials with others
- ❌ Avoid using root/admin account credentials

### Credential Expiration and Management

#### Amazon Bedrock:

If you're using temporary credentials:

- Lightning mode will return an error when credentials expire
- You'll need to generate new temporary credentials and re-enter them
- Export your threat model before credentials expire to avoid losing work

#### OpenAI:

- API keys don't expire automatically but can be deactivated
- Monitor your usage limits to avoid service interruptions
- Keep track of your organization's billing limits

The application stores credentials only in your browser's memory and automatically clears them when you close the tab or refresh the page, ensuring your credentials remain secure.
