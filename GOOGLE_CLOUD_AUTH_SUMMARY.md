# Google Cloud Authentication Summary

## ✅ What REQUIRES Google Cloud Credentials

### Only ONE service needs Google Cloud auth:

**1. Google Cloud Storage (`@google-cloud/storage`)**
- **Used in**: All API routes for storing/retrieving files
- **Fixed**: All routes now use `getStorage()` from `/src/utils/gcs.ts`
- **Environment variable**: `GOOGLE_APPLICATION_CREDENTIALS_JSON`

**Updated files:**
- ✅ `/src/app/api/music/generate/route.ts`
- ✅ `/src/app/api/whiteboard/text/route.ts`
- ✅ `/src/app/api/whiteboard/send/route.ts`
- ✅ `/src/app/api/whiteboard/status/route.ts`
- ✅ `/src/app/api/whiteboard/webhook/route.ts`
- ✅ `/src/app/api/world/list/route.ts`
- ✅ `/src/app/api/world/status/route.ts`
- ✅ `/src/app/api/world/generate/route.ts`

## ❌ What DOES NOT Require Google Cloud Credentials

### These use API keys instead:

**1. Gemini API (`@google/genai`)**
- **Used in**: `/src/app/api/text/complete/route.ts`
- **Uses**: `GEMINI_API_KEY` environment variable (API key)
- **Authentication**: `{ vertexai: false, apiKey: GEMINI_API_KEY }`
- **No action needed** ✅

**2. Gemini REST API (direct fetch)**
- **Used in**: 
  - `/src/app/api/world/generate/route.ts`
  - `/src/app/api/whiteboard/send/route.ts`
- **Uses**: `GEMINI_API_KEY` via `x-goog-api-key` header
- **Endpoint**: `generativelanguage.googleapis.com`
- **No action needed** ✅

**3. Google Fonts**
- **Used in**: `/src/app/layout.tsx`
- **Import**: `Space_Grotesk` from `next/font/google`
- **Authentication**: None needed (public API)
- **No action needed** ✅

## Quick Fix Summary

If you're getting "Could not load default credentials" error:

1. **Root cause**: Google Cloud Storage needs credentials
2. **Solution**: Set `GOOGLE_APPLICATION_CREDENTIALS_JSON` in Vercel
3. **How**: Copy your service account JSON key contents to this env var

See `VERCEL_GCS_SETUP.md` for detailed setup instructions.

## Verification

Run this to confirm no other Google Cloud services are used:
```bash
grep -r "new Storage()" src/
# Should only show: src/utils/gcs.ts

grep -r "from \"@google-cloud" src/
# Should only show: src/utils/gcs.ts (imports Storage)
```

## Environment Variables Checklist

**Required for Google services (choose one method):**

Method 1 (Recommended - separate variables):
- [ ] `GCP_PRIVATE_KEY` - Service account private key
- [ ] `GCP_SERVICE_ACCOUNT_EMAIL` - Service account email
- [ ] `GCP_PROJECT_ID` - GCP project ID

Method 2 (Alternative - single JSON):
- [ ] `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Full service account JSON

**Other Google services:**
- [ ] `GEMINI_API_KEY` - Gemini API key (not credentials)

**Other services:**
- [ ] `ELEVENLABS_API_KEY`
- [ ] `MESHY_API_KEY`
- [ ] `TRIPO3D_API_KEY`
- [ ] `MARBLE_API_TOKEN`

