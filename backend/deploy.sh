#!/bin/bash

# Deploy Backend to Cloud Run Script
# This script will build and deploy the backend to Cloud Run

# Set variables
PROJECT_ID="account-pocs"
COMMIT_SHA=$(date +%Y%m%d-%H%M%S)
SERVICE_NAME="gemini-backend-service"
REGION="us-central1"
IMAGE_NAME="gemini-backend"

echo "=== Deploying Backend to Cloud Run ==="
echo "Project ID: $PROJECT_ID"
echo "Commit SHA: $COMMIT_SHA"
echo "Service Name: $SERVICE_NAME"
echo "Region: $REGION"

# Navigate to the backend directory (in case script is run from elsewhere)
cd "$(dirname "$0")"

# Read environment variables from .env file to set in Cloud Run
if [ -f .env ]; then
  echo "=== Reading environment variables from .env file ==="
  # Extract environment variables from .env file
  ENV_VARS=""
  while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    if [[ -z "$key" || "$key" =~ ^# ]]; then
      continue
    fi
    
    # Remove quotes from the value if present
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    
    # Skip GOOGLE_APPLICATION_CREDENTIALS as it's not needed in Cloud Run
    if [[ "$key" == "GOOGLE_APPLICATION_CREDENTIALS" ]]; then
      echo "Skipping GOOGLE_APPLICATION_CREDENTIALS as it's not needed in Cloud Run"
      continue
    fi
    
    # Add to ENV_VARS string
    if [[ -z "$ENV_VARS" ]]; then
      ENV_VARS="$key=$value"
    else
      ENV_VARS="$ENV_VARS,$key=$value"
    fi
    
    echo "Added environment variable: $key"
  done < .env
  
  echo "=== Environment variables prepared for deployment ==="
else
  echo "No .env file found. Proceeding without environment variables."
  ENV_VARS=""
fi

# Use gcloud to build and deploy the service
echo "=== Deploying with gcloud run services directly ==="
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --set-env-vars=$ENV_VARS

if [ $? -eq 0 ]; then
  echo "=== Getting service URL ==="
  SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region=$REGION --format 'value(status.url)')
  echo "=== Backend is available at: $SERVICE_URL ==="
  # Save the URL to a file for future reference
  echo $SERVICE_URL > ../backend_url.txt
  echo "=== URL saved to ../backend_url.txt ==="
else
  echo "=== Cloud Run deployment failed! ==="
  exit 1
fi
