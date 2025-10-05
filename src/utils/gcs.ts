import { Storage } from "@google-cloud/storage";

/**
 * Get GCP credentials from environment variables.
 * Supports two methods:
 * 1. Separate env vars (recommended): GCP_PRIVATE_KEY, GCP_SERVICE_ACCOUNT_EMAIL, GCP_PROJECT_ID
 * 2. JSON string: GOOGLE_APPLICATION_CREDENTIALS_JSON
 * 3. Local development: empty object (uses gcloud CLI)
 */
export const getGCPCredentials = () => {
  // Method 1: Separate environment variables (recommended for Vercel)
  if (process.env.GCP_PRIVATE_KEY) {
    return {
      credentials: {
        client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY,
      },
      projectId: process.env.GCP_PROJECT_ID,
    };
  }

  // Method 2: Full JSON credentials (backward compatibility)
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson);
      return {
        credentials,
        projectId: credentials.project_id,
      };
    } catch (error) {
      console.error("[GCS] Failed to parse credentials JSON:", error);
    }
  }

  // Method 3: Local development (uses gcloud CLI)
  return {};
};

/**
 * Initialize Google Cloud Storage with credentials.
 */
export function getStorage(): Storage {
  return new Storage(getGCPCredentials());
}

