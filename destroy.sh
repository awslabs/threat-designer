#!/bin/bash

# Exit on any error
set -e

# Colors for better visual feedback
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .deployment.config exists
if [ ! -f ".deployment.config" ]; then
    echo -e "${RED}Error: .deployment.config file not found.${NC}"
    echo -e "${BLUE}This file is required as it contains the deployment configuration.${NC}"
    exit 1
fi

# Load deployment config
source .deployment.config

# Verify required variables
required_vars=("USERNAME" "EMAIL" "GIVEN_NAME" "FAMILY_NAME" "REGION")
missing_vars=0

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}Error: ${var} is missing in .deployment.config${NC}"
        missing_vars=1
    fi
done

if [ $missing_vars -eq 1 ]; then
    echo -e "${RED}Required variables are missing in .deployment.config${NC}"
    exit 1
fi

# Confirmation prompt
echo -e "${RED}Warning: This will destroy all infrastructure created by Terraform.${NC}"
echo -e "\n${BLUE}Configuration that will be used:${NC}"
echo -e "Username: ${GREEN}$USERNAME${NC}"
echo -e "Email: ${GREEN}$EMAIL${NC}"
echo -e "Given Name: ${GREEN}$GIVEN_NAME${NC}"
echo -e "Family Name: ${GREEN}$FAMILY_NAME${NC}"
echo -e "Region: ${GREEN}$REGION${NC}"

while true; do
    echo -e "\n${RED}Are you sure you want to proceed with destruction? (yes/no)${NC}"
    read -r answer
    case $answer in
        yes ) break;;
        no ) echo -e "${BLUE}Destruction cancelled.${NC}"; exit 0;;
        * ) echo -e "${RED}Please answer 'yes' or 'no'${NC}";;
    esac
done

# Change to terraform directory
cd ./infra

# Verify terraform is initialized
if [ ! -d ".terraform" ]; then
    echo -e "${BLUE}Initializing Terraform...${NC}"
    if ! terraform init; then
        echo -e "${RED}Terraform initialization failed. Exiting...${NC}"
        exit 1
    fi
fi

# Run terraform destroy
echo -e "\n${BLUE}Starting infrastructure destruction...${NC}"

# Build terraform destroy command with required variables
TF_DESTROY_VARS="-var=username=$USERNAME"
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=given_name=$GIVEN_NAME"
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=family_name=$FAMILY_NAME"
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=email=$EMAIL"
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=region=$REGION"

# Add enable_sentry if it exists in config, otherwise use default
if [ -n "$ENABLE_SENTRY" ]; then
    TF_DESTROY_VARS="$TF_DESTROY_VARS -var=enable_sentry=$ENABLE_SENTRY"
fi

# Set safe defaults for model provider variables (not needed for destroy but required by Terraform)
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=model_provider=bedrock"
TF_DESTROY_VARS="$TF_DESTROY_VARS -var=openai_api_key=dummy-key-for-destroy"

if ! terraform destroy -auto-approve $TF_DESTROY_VARS; then
    echo -e "${RED}Terraform destroy failed. Exiting...${NC}"
    exit 1
fi

# Return to root directory
cd ..

# Cleanup local files
echo -e "\n${BLUE}Cleaning up local files...${NC}"
rm -f .env .deployment.config

echo -e "\n${GREEN}Infrastructure successfully destroyed and local files cleaned up.${NC}"