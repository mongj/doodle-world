# PLY to GLB Converter Service

A Dockerized Python service that converts PLY point cloud files to GLB mesh files using PDAL and stores them in Google Cloud Storage.

## Features

- ✅ FastAPI-based REST API
- ✅ Converts PLY → GLB mesh
- ✅ Uploads to Google Cloud Storage
- ✅ Returns public URLs
- ✅ Fully Dockerized
- ✅ Health check endpoints

## Architecture

The conversion pipeline:

1. **Download** PLY file from provided URL
2. **Mesh** PLY to GLB using PDAL's greedyprojection filter
3. **Upload** GLB to GCS bucket
4. **Return** public GCS URL

## Prerequisites

- Docker
- Google Cloud Storage bucket
- GCS Service Account with write permissions (for production)

## Quick Start

### 1. Build the Docker image

```bash
cd splat-to-mesh
docker build -t splat-converter .
```

### 2. Run the service

**Basic usage (with dummy bucket):**

```bash
docker run -p 8000:8000 \
  -e GCS_BUCKET=my-splat-converter-bucket \
  splat-converter
```

**With GCS credentials for production:**

```bash
# Create credentials directory
mkdir -p credentials

# Copy your GCS service account key
cp /path/to/your/service-account-key.json credentials/gcs-key.json

# Run with credentials mounted
docker run -p 8000:8000 \
  -e GCS_BUCKET=your-bucket-name \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcs-key.json \
  -v $(pwd)/credentials:/app/credentials:ro \
  splat-converter
```

The service will be available at `http://localhost:8000`

## API Usage

### Health Check

```bash
curl http://localhost:8000/health
```

Response:

```json
{
  "status": "healthy"
}
```

### Convert PLY to GLB

**Endpoint:** `GET /convert`

**Query Parameters:**

- `url` (required): URL of the PLY file to convert

**Request:**

```bash
curl "http://localhost:8000/convert?url=https://example.com/path/to/file.ply"
```

**Response:**

```json
{
  "glb_url": "https://storage.googleapis.com/my-splat-converter-bucket/conversions/converted_20250104_123456.glb",
  "message": "Conversion successful"
}
```

## Environment Variables

| Variable                         | Description                      | Default                     |
| -------------------------------- | -------------------------------- | --------------------------- |
| `GCS_BUCKET`                     | Google Cloud Storage bucket name | `my-splat-converter-bucket` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCS service account key  | -                           |
| `PORT`                           | Server port                      | `8000`                      |
| `HOST`                           | Server host                      | `0.0.0.0`                   |

## Development

### Running without Docker

**macOS:**

```bash
# Install system dependencies first
brew install pdal

# Then install Python dependencies
pip3 install -r requirements.txt

# Run the server
python3 app.py
```

**Ubuntu/Debian:**

```bash
# Install system dependencies
sudo apt-get install pdal

# Install Python dependencies
pip3 install -r requirements.txt

# Run the server
python3 app.py
```

**Note:** This service uses PDAL CLI (command-line) instead of Python bindings, so no compilation is needed.

### Testing the API

```bash
# With a sample PLY file URL
curl "http://localhost:8000/convert?url=https://storage.googleapis.com/your-bucket/sample.ply"
```

## Production Deployment

### Using Google Cloud Run

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/splat-converter

# Deploy to Cloud Run
gcloud run deploy splat-converter \
  --image gcr.io/YOUR_PROJECT_ID/splat-converter \
  --platform managed \
  --region us-central1 \
  --set-env-vars GCS_BUCKET=your-bucket-name \
  --allow-unauthenticated
```

### Using Kubernetes

```bash
# Build and push image
docker build -t your-registry/splat-converter:latest .
docker push your-registry/splat-converter:latest

# Deploy using kubectl
kubectl apply -f k8s-deployment.yaml
```

## Technical Details

### PDAL Pipeline

The service uses a PDAL pipeline with:

- `readers.ply`: Reads point cloud data
- `filters.greedyprojection`: Creates mesh from points (radius=1.0, multiplier=2.5)
- `writers.gltf`: Writes GLB output

### Dependencies

- **FastAPI**: Modern Python web framework
- **PDAL**: Point cloud processing library
- **google-cloud-storage**: GCS Python client

## Troubleshooting

### Issue: "GCS upload failed"

Check:

1. Service account has write permissions to the bucket
2. Bucket name is correct in environment variables
3. Credentials file is properly mounted

### Issue: "PDAL conversion failed"

- Check that input PLY file is valid
- Verify PDAL is properly installed with required plugins
- Check logs for detailed error messages

## License

MIT

## Contributing

Contributions welcome! Please submit pull requests or open issues.
