# Vercel Deployment Quick Start

## ✅ What's Been Fixed

1. ✅ **Google Cloud Storage credentials** - Now supports clean environment variables
2. ✅ **Marble API validation error** - Fixed null field issue
3. ✅ **All 8 API routes updated** - Using centralized credential management

## 🚀 Deploy to Vercel in 3 Steps

### Step 1: Get Your GCP Service Account Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to: **IAM & Admin** → **Service Accounts**
3. Create new or select existing service account
4. Create JSON key and download it

### Step 2: Set Vercel Environment Variables

Open your JSON file and find these three values:

In Vercel dashboard → **Settings** → **Environment Variables**, add:

```
GCP_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\n...your key...\n-----END PRIVATE KEY-----\n"
GCP_SERVICE_ACCOUNT_EMAIL = "your-account@your-project.iam.gserviceaccount.com"
GCP_PROJECT_ID = "your-project-id"
```

✅ Check all environments (Production, Preview, Development)

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Click **⋯** on latest deployment → **Redeploy**
3. Done! ✨

## 📋 All Required Environment Variables

Make sure you have these set in Vercel:

**GCP (choose one method):**
- Method A (Recommended): `GCP_PRIVATE_KEY`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_PROJECT_ID`
- Method B (Alternative): `GOOGLE_APPLICATION_CREDENTIALS_JSON`

**AI APIs:**
- `GEMINI_API_KEY` - For Gemini AI
- `ELEVENLABS_API_KEY` - For music generation
- `MESHY_API_KEY` - For 3D model generation
- `TRIPO3D_API_KEY` - For 3D model generation (fallback)
- `MARBLE_API_TOKEN` - For world generation

## 🔍 Troubleshooting

### "Could not load default credentials" error
→ Set the GCP environment variables (Step 2 above)

### "Input should be a valid dictionary" error (Marble API)
→ Fixed! Make sure you deployed the latest code

### Still having issues?
1. Check all environment variables are set correctly
2. Verify GCP service account has **Storage Object Admin** role
3. Check Vercel deployment logs for specific errors

## 📚 More Details

- Full setup guide: `VERCEL_GCS_SETUP.md`
- Technical details: `GOOGLE_CLOUD_AUTH_SUMMARY.md`

