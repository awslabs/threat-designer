#!/bin/bash

# Exit on any error
set -e

# Colors for better visual feedback
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get user input with validation
get_input() {
    local prompt="$1"
    local var_name="$2"
    local value=""
    while true; do
        echo -e "${BLUE}$prompt${NC}"
        read -r value
        if [ -z "$value" ]; then
            echo -e "${RED}This field cannot be empty. Please try again.${NC}"
        else
            eval "$var_name='$value'"
            break
        fi
    done
}

# Function to get AWS region
get_region() {
    echo -e "${BLUE}Enter AWS region (press Enter for default: us-east-1):${NC}"
    read -r choice
    if [ -z "$choice" ]; then
        REGION="us-east-1"
    else
        REGION="$choice"
    fi
}

# Function to get deployment type
get_deployment_type() {
    while true; do
        echo -e "${BLUE}Select deployment type:${NC}"
        echo -e "1) Both backend and frontend ${GREEN}(default)${NC}"
        echo "2) Backend only"
        echo "3) Frontend only"
        read -r choice
        if [ -z "$choice" ]; then
            DEPLOY_TYPE="both"
            break
        fi
        case $choice in
            1) DEPLOY_TYPE="both"; break;;
            2) DEPLOY_TYPE="backend"; break;;
            3) DEPLOY_TYPE="frontend"; break;;
            *) echo -e "${RED}Invalid choice. Please select 1, 2, or 3${NC}";;
        esac
    done
}

# Function to confirm inputs
confirm_inputs() {
    echo -e "\n${GREEN}Please confirm your inputs:${NC}"
    echo -e "Username: ${BLUE}$USERNAME${NC}"
    echo -e "Given Name: ${BLUE}$GIVEN_NAME${NC}"
    echo -e "Family Name: ${BLUE}$FAMILY_NAME${NC}"
    echo -e "Email: ${BLUE}$EMAIL${NC}"
    echo -e "Region: ${BLUE}$REGION${NC}"
    echo -e "Deployment Type: ${BLUE}$DEPLOY_TYPE${NC}"
    
    while true; do
        echo -e "\n${BLUE}Is this correct? (y/n)${NC}"
        read -r confirm
        case $confirm in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo -e "${RED}Please answer y or n${NC}";;
        esac
    done
}

# Welcome message
clear
echo -e "${GREEN}Welcome to the Deployment Wizard!${NC}"
echo -e "This wizard will guide you through the deployment process.\n"
# Main wizard loop
while true; do
    # Get deployment type first
    get_deployment_type
    
    # Get AWS region
    get_region
    
    # Only gather user details if deploying backend or both
    if [ "$DEPLOY_TYPE" != "frontend" ]; then
        # Get user inputs
        get_input "Enter username:" USERNAME
        # Email validation
        while true; do
            get_input "Enter email:" EMAIL
            if [[ $EMAIL =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                break
            else
                echo -e "${RED}Invalid email format. Please try again.${NC}"
            fi
        done
        get_input "Enter given name:" GIVEN_NAME
        get_input "Enter family name:" FAMILY_NAME
    fi
    
    # Modify confirm_inputs function to show different information based on deployment type
    echo -e "\n${GREEN}Please confirm your inputs:${NC}"
    echo -e "Deployment Type: ${BLUE}$DEPLOY_TYPE${NC}"
    echo -e "Region: ${BLUE}$REGION${NC}"
    if [ "$DEPLOY_TYPE" != "frontend" ]; then
        echo -e "Username: ${BLUE}$USERNAME${NC}"
        echo -e "Given Name: ${BLUE}$GIVEN_NAME${NC}"
        echo -e "Family Name: ${BLUE}$FAMILY_NAME${NC}"
        echo -e "Email: ${BLUE}$EMAIL${NC}"
    fi
    
    while true; do
        echo -e "\n${BLUE}Is this correct? (y/n)${NC}"
        read -r confirm
        case $confirm in
            [Yy]* ) break 2;; # Break out of both loops
            [Nn]* ) break;;   # Break out of just the confirmation loop
            * ) echo -e "${RED}Please answer y or n${NC}";;
        esac
    done
    echo -e "\n${BLUE}Let's start over...${NC}\n"
done

ZIP_FILE="build.zip"
BRANCH="dev"

# Backend deployment function
deploy_backend() {
    echo -e "\n${GREEN}Deploying backend infrastructure...${NC}"
    
    # Change to terraform directory
    cd ./infra

    # Initialize Terraform if .terraform directory doesn't exist
    if [ ! -d ".terraform" ]; then
        echo -e "${BLUE}Initializing Terraform...${NC}"
        if ! terraform init; then
            echo -e "${RED}Terraform initialization failed. Exiting...${NC}"
            exit 1
        fi
    fi

    # Run terraform apply with variables and capture the exit status
    if ! terraform apply -auto-approve \
        -var="username=$USERNAME" \
        -var="given_name=$GIVEN_NAME" \
        -var="family_name=$FAMILY_NAME" \
        -var="email=$EMAIL" \
        -var="region=$REGION"; then
        echo -e "${RED}Terraform apply failed. Exiting...${NC}"
        exit 1
    fi

    # Extract values from terraform output
    if ! APP_ID=$(terraform output -raw amplify_app_id) || \
       ! VITE_APP_ENDPOINT=$(terraform output -raw api_endpoint) || \
       ! VITE_COGNITO_REGION=$(terraform output -raw region) || \
       ! VITE_USER_POOL_ID=$(terraform output -raw user_pool_id) || \
       ! VITE_APP_CLIENT_ID=$(terraform output -raw app_client_id) || \
       ! VITE_COGNITO_DOMAIN=$(terraform output -raw cognito_domain); then
        echo -e "${RED}Failed to get one or more required Terraform outputs. Exiting...${NC}"
        exit 1
    fi

    # Read and check variables.tf for reasoning models
    if [ -f "variables.tf" ]; then
        # Extract main model ID
        MAIN_MODEL=$(grep -A 5 'model_main' variables.tf | grep 'id' | grep -o '".*"' | tr -d '"')
        
        # Extract reasoning models list
        REASONING_MODELS=$(grep -A 5 'reasoning_models' variables.tf | grep -o '".*"' | tr -d '"')
        
        # Check if main model exists in reasoning models
        if echo "$REASONING_MODELS" | grep -q "$MAIN_MODEL"; then
            VITE_REASONING_ENABLED="true"
        else
            VITE_REASONING_ENABLED="false"
        fi
    else
        echo -e "${RED}Warning: variables.tf not found. Setting reasoning to false by default.${NC}"
        VITE_REASONING_ENABLED="false"
    fi

    VITE_REDIRECT_SIGN_IN="https://dev.${APP_ID}.amplifyapp.com"
    VITE_REDIRECT_SIGN_OUT="https://dev.${APP_ID}.amplifyapp.com"
    export AWS_DEFAULT_REGION=$REGION

    # Return to root directory
    cd ..

    # Create .env file
    cat > .env << EOF
VITE_APP_ENDPOINT=$VITE_APP_ENDPOINT
VITE_COGNITO_REGION=$VITE_COGNITO_REGION
VITE_USER_POOL_ID=$VITE_USER_POOL_ID
VITE_APP_CLIENT_ID=$VITE_APP_CLIENT_ID
VITE_COGNITO_DOMAIN=$VITE_COGNITO_DOMAIN
VITE_REDIRECT_SIGN_IN=$VITE_REDIRECT_SIGN_IN
VITE_REDIRECT_SIGN_OUT=$VITE_REDIRECT_SIGN_OUT
VITE_REASONING_ENABLED=$VITE_REASONING_ENABLED
EOF

    # Create .deployment.config file
    cat > .deployment.config << EOF
APP_ID=$APP_ID
BRANCH=$BRANCH
USERNAME=$USERNAME
EMAIL=$EMAIL
GIVEN_NAME=$GIVEN_NAME
FAMILY_NAME=$FAMILY_NAME
REGION=$REGION
EOF

    echo -e "${GREEN}Backend deployment completed successfully${NC}"
}

# Frontend deployment function
deploy_frontend() {
    echo -e "\n${GREEN}Deploying frontend...${NC}"

        # Check for deployment config file
    if [ ! -f ".deployment.config" ]; then
        echo -e "${RED}Error: .deployment.config file not found. Please deploy backend first.${NC}"
        echo -e "${BLUE}The .deployment.config file is required for frontend deployment as it contains the Amplify app ID.${NC}"
        exit 1
    fi

    # Load deployment config
    source .deployment.config
    
    if [ -z "$APP_ID" ]; then
        echo -e "${RED}Error: APP_ID not found in .deployment.config${NC}"
        exit 1
    fi

    # Check for .env file
    if [ ! -f ".env" ]; then
        echo -e "${RED}Error: .env file not found. Please deploy backend first or ensure .env file exists.${NC}"
        echo -e "${BLUE}The .env file is required for frontend deployment as it contains necessary configuration.${NC}"
        exit 1
    fi

    # Verify required variables in .env
    required_vars=("VITE_APP_ENDPOINT" "VITE_COGNITO_REGION" "VITE_USER_POOL_ID" "VITE_APP_CLIENT_ID" "VITE_COGNITO_DOMAIN" "VITE_REDIRECT_SIGN_IN" "VITE_REDIRECT_SIGN_OUT")
    
    missing_vars=0
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            echo -e "${RED}Error: ${var} is missing in .env file${NC}"
            missing_vars=1
        fi
    done

    if [ $missing_vars -eq 1 ]; then
        echo -e "${RED}Required variables are missing in .env file. Please deploy backend first.${NC}"
        exit 1
    fi

    # Load environment variables from .env
    export $(cat .env | xargs)

    # Install npm dependencies
    echo -e "${BLUE}Installing npm dependencies...${NC}"
    if ! npm install; then
        echo -e "${RED}npm install failed. Exiting...${NC}"
        exit 1
    fi

    # Build the project
    if ! npm run build; then
        echo -e "${RED}npm build failed. Exiting...${NC}"
        exit 1
    fi

    # Compress the contents in dist folder
    cd dist && zip -r ../$ZIP_FILE . && cd ..

    # Create deployment and capture the response
    if ! DEPLOYMENT_INFO=$(aws amplify create-deployment --app-id $APP_ID --branch-name $BRANCH --region $VITE_COGNITO_REGION); then
        echo -e "${RED}Failed to create Amplify deployment. Exiting...${NC}"
        exit 1
    fi

    # Extract jobId and zipUploadUrl from the response
    JOB_ID=$(echo $DEPLOYMENT_INFO | jq -r '.jobId')
    UPLOAD_URL=$(echo $DEPLOYMENT_INFO | jq -r '.zipUploadUrl')

    if [ -z "$JOB_ID" ] || [ -z "$UPLOAD_URL" ]; then
        echo -e "${RED}Failed to extract job ID or upload URL. Exiting...${NC}"
        exit 1
    fi

    # Upload the zip file
    if ! curl -H "Content-Type: application/zip" -X PUT -T $ZIP_FILE "$UPLOAD_URL"; then
        echo -e "${RED}Failed to upload zip file. Exiting...${NC}"
        exit 1
    fi

    # Start the deployment
    if ! aws amplify start-deployment \
        --region $VITE_COGNITO_REGION \
        --app-id $APP_ID \
        --branch-name $BRANCH \
        --job-id $JOB_ID; then
        echo -e "${RED}Failed to start Amplify deployment. Exiting...${NC}"
        exit 1
    fi

    echo -e "${GREEN}Frontend deployment completed successfully${NC}"
}

# Main deployment logic
case $DEPLOY_TYPE in
    "backend")
        deploy_backend
        ;;
    "frontend")
        deploy_frontend
        ;;
    "both")
        deploy_backend
        deploy_frontend
        ;;
esac

echo -e "\n${GREEN}Deployment completed successfully!${NC}"
echo -e "\n${GREEN}Application Login page: ${BLUE}$VITE_REDIRECT_SIGN_IN${NC}"