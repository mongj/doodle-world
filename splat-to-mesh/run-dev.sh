#!/bin/bash

# Development script to run the Docker container with GCS credentials

# Check if gcloud credentials exist
CREDS_PATH="$HOME/.config/gcloud/application_default_credentials.json"

if [ ! -f "$CREDS_PATH" ]; then
    echo "❌ Google Cloud credentials not found at $CREDS_PATH"
    echo "Run: gcloud auth application-default login"
    exit 1
fi

echo "✅ Found Google Cloud credentials"
echo "🚀 Starting splat-to-mesh service on port 8080..."

docker build -t splat-to-mesh .
docker run -it --rm \
  -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT=doodle-world-474114 \
  -e GOOGLE_APPLICATION_CREDENTIALS=/home/converter/.config/gcloud/application_default_credentials.json \
  -v "$HOME/.config/gcloud:/home/converter/.config/gcloud:ro" \
  --name splat-to-mesh \
  splat-to-mesh

# Alternative if you have a service account key:
# docker run -it --rm \
#   -p 8080:8080 \
#   -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
#   -v ./credentials.json:/app/credentials.json:ro \
#   --name splat-converter \
#   splat-to-mesh

