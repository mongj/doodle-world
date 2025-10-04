# Cloud Run Deployment Guide

## Prerequisites

1. **Google Cloud CLI installed:**

   ```bash
   gcloud --version
   ```

2. **Authenticated:**

   ```bash
   gcloud auth login
   gcloud config set project doodle-world-474114
   ```

3. **Enable required APIs:**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable storage.googleapis.com
   ```

## Service Account Permissions

### Option 1: Use Default Compute Service Account (Easiest)

Cloud Run will automatically use the default Compute Engine service account which has these permissions:

- **Email:** `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
- **Permissions:** Already has broad permissions including Storage Admin

**No additional setup needed!** The default service account can already write to your GCS bucket.

### Option 2: Use Custom Service Account (More Secure)

If you want tighter permissions:

```bash
# Create a custom service account
gcloud iam service-accounts create splat-converter \
  --display-name="Splat to Mesh Converter"

# Grant Storage Object Admin permission
gcloud projects add-iam-policy-binding doodle-world-474114 \
  --member="serviceAccount:splat-converter@doodle-world-474114.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Deploy with custom service account
gcloud run deploy splat-to-mesh \
  --source . \
  --service-account splat-converter@doodle-world-474114.iam.gserviceaccount.com \
  --region us-central1 \
  --allow-unauthenticated
```

## Quick Deploy

### Using the Deploy Script:

```bash
cd splat-to-mesh
./deploy.sh
```

### Manual Deploy:

```bash
gcloud run deploy splat-to-mesh \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --set-env-vars GCS_BUCKET=doodle-world-static
```

## Make Bucket Public (Optional)

If you want the converted GLB files to be publicly accessible:

```bash
# Make bucket publicly readable
gsutil iam ch allUsers:objectViewer gs://doodle-world-static

# Or just the conversions folder
gsutil iam ch allUsers:objectViewer gs://doodle-world-static/conversions/
```

## Test Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe splat-to-mesh \
  --region us-central1 \
  --format 'value(status.url)')

# Test health endpoint
curl "$SERVICE_URL/health"

# Test conversion
curl "$SERVICE_URL/convert?url=https://example.com/file.ply"
```

## Update Deployment

```bash
./deploy.sh
```

Or to update just environment variables:

```bash
gcloud run services update splat-to-mesh \
  --region us-central1 \
  --set-env-vars GCS_BUCKET=new-bucket-name
```

## View Logs

```bash
gcloud run services logs read splat-to-mesh \
  --region us-central1 \
  --limit 50
```

## Configuration

### Environment Variables:

- `GCS_BUCKET`: Target GCS bucket (default: `doodle-world-static`)
- `GOOGLE_CLOUD_PROJECT`: GCP project ID (auto-set by Cloud Run)

### Resources:

- **Memory:** 2GB (PDAL conversion requires memory)
- **CPU:** 2 vCPUs
- **Timeout:** 600 seconds (10 minutes for large files)
- **Max Instances:** 10 (adjust based on expected load)

## Cost Optimization

Cloud Run charges for:

- **CPU/Memory usage** during request processing
- **Number of requests**
- **Networking** (egress)

Tips:

- Service scales to zero when not in use
- Only pay for actual processing time
- First 2 million requests/month are free

## Security Notes

1. **Service is public** (`--allow-unauthenticated`) - anyone can convert files
2. **Consider adding authentication** for production use
3. **Default service account has broad permissions** - use custom SA for production
4. **No rate limiting** by default - consider adding Cloud Armor

## Troubleshooting

### "Permission denied" errors:

```bash
# Check service account permissions
gcloud run services describe splat-to-mesh \
  --region us-central1 \
  --format 'value(spec.template.spec.serviceAccountName)'
```

### Check PDAL installation:

The Docker build logs will show PDAL installation. View with:

```bash
gcloud builds list --limit 1
```

### Increase timeout for large files:

```bash
gcloud run services update splat-to-mesh \
  --region us-central1 \
  --timeout 900
```
