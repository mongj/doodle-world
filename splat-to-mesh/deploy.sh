#!/bin/bash

# Deploy script for Cloud Run

PROJECT_ID="doodle-world-474114"
SERVICE_NAME="splat-to-mesh"
REGION="us-central1"
GCS_BUCKET="doodle-world-static"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Bucket: $GCS_BUCKET"
echo ""

# Build and deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --set-env-vars GCS_BUCKET=$GCS_BUCKET \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
  --max-instances 10

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Test your service:"
echo "SERVICE_URL=\$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')"
echo "curl \"\$SERVICE_URL/health\""

