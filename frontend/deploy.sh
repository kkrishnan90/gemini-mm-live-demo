#!/bin/bash

# Deploy Frontend to Cloud Run Script
# This script will build and deploy the frontend to Cloud Run

# Set variables
PROJECT_ID="account-pocs"
COMMIT_SHA=$(date +%Y%m%d-%H%M%S)
SERVICE_NAME="frontend-service"
REGION="us-central1"

# Hard-coded backend URL as specified
BACKEND_URL="https://gemini-backend-service-1018963165306.us-central1.run.app"

echo "=== Deploying Frontend to Cloud Run ==="
echo "Project ID: $PROJECT_ID"
echo "Commit SHA: $COMMIT_SHA"
echo "Service Name: $SERVICE_NAME"
echo "Region: $REGION"
echo "Backend URL: $BACKEND_URL"

# Navigate to the frontend directory (in case script is run from elsewhere)
cd "$(dirname "$0")"

# Deploy directly to Cloud Run from source
echo "=== Deploying to Cloud Run ==="
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --set-build-env-vars=REACT_APP_BACKEND_URL=$BACKEND_URL

if [ $? -eq 0 ]; then
  echo "=== Getting service URL ==="
  SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region=$REGION --format 'value(status.url)')
  echo "=== Frontend is available at: $SERVICE_URL ==="
  echo "=== Frontend deployment complete! ==="
else
  echo "=== Frontend deployment failed! ==="
  exit 1
fi