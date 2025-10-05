# Google Cloud Storage Setup for Vercel

## Quick Fix (5 minutes)

### 1. Get your Google Cloud Service Account Key

If you don't have a service account yet:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Go to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
   - Name: `vercel-doodle-world`
   - Role: **Storage Object Admin** (or Storage Admin)
5. Click **Create Key** → JSON
6. Download the JSON file

### 2. Add to Vercel Environment Variables (Recommended Method)

Open the downloaded JSON file and extract these values:

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add these **3 variables** (easier to manage):
   
   **Variable 1:**
   - **Name**: `GCP_PRIVATE_KEY`
   - **Value**: Copy the `private_key` value from your JSON (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - **Environment**: Production, Preview, Development (check all)
   
   **Variable 2:**
   - **Name**: `GCP_SERVICE_ACCOUNT_EMAIL`
   - **Value**: Copy the `client_email` value from your JSON
   - **Environment**: Production, Preview, Development (check all)
   
   **Variable 3:**
   - **Name**: `GCP_PROJECT_ID`
   - **Value**: Copy the `project_id` value from your JSON
   - **Environment**: Production, Preview, Development (check all)

4. Click **Save** for each

### Alternative: Single JSON Variable (Also Supported)

If you prefer, you can also use a single variable:
   - **Name**: `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   - **Value**: Paste the entire JSON contents
   - **Environment**: Production, Preview, Development (check all)

### 3. Redeploy

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click the **⋯** menu → **Redeploy**
4. Check "Use existing Build Cache"
5. Click **Redeploy**

That's it! Your app should now work with Google Cloud Storage on Vercel.

## What Changed in the Code

All API routes now use a centralized `getStorage()` function from `/src/utils/gcs.ts` that:
- Reads credentials from `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable
- Falls back to default credentials for local development
- No code changes needed when switching between local and Vercel deployments

## Troubleshooting

If you still get errors:

1. **Check the JSON format**: Make sure the entire JSON is copied correctly (no missing quotes, commas, etc.)
2. **Check permissions**: Service account needs **Storage Object Admin** role
3. **Check project ID**: Make sure the `project_id` in your JSON matches your GCS bucket's project
4. **Check bucket name**: Verify `doodle-world-static` bucket exists in your project

## Security Note

The service account key is sensitive. Keep it secure:
- ✅ Store in Vercel environment variables (encrypted)
- ❌ Never commit to Git
- ❌ Never share publicly

