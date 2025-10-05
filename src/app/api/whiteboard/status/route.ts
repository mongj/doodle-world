import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds - if webhook is older, fall back to API
const GCS_BUCKET_NAME = "doodle-world-static";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing taskId parameter" },
        { status: 400 }
      );
    }

    // Read from task-specific file first (webhook data)
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const taskFile = bucket.file(`meshy_tasks/${taskId}.json`);
    
    let shouldFallbackToAPI = false;
    
    const [exists] = await taskFile.exists();
    if (exists) {
      const [statusContent] = await taskFile.download();
      const statusData = JSON.parse(statusContent.toString("utf-8"));

      // Check if webhook data is fresh and complete
      // Trust data if it came via webhook OR if it's a completed Tripo3D fallback
      if (statusData.receivedViaWebhook || statusData.switched_to_tripo3d) {
        const lastUpdated = statusData.lastUpdated ? new Date(statusData.lastUpdated).getTime() : 
                           (statusData.updated_at ? new Date(statusData.updated_at).getTime() : 0);
        const age = Date.now() - lastUpdated;
        
        // If webhook is recent and task is terminal state, use it
        if (statusData.status === "SUCCEEDED" || statusData.status === "FAILED" || statusData.status === "EXPIRED") {
          console.log(`[Status] Using webhook data for ${taskId} (terminal state)`);
          console.log(`[Status] Provider: ${statusData.provider}, switched: ${statusData.switched_to_tripo3d}`);
          console.log(`[Status] model_urls:`, statusData.model_urls);
          console.log(`[Status] model_url:`, statusData.model_url);
          return NextResponse.json({
            progress: statusData.progress || 0,
            status: statusData.status || "UNKNOWN",
            model_urls: statusData.model_urls || {},
            model_url: statusData.model_url || (statusData.model_urls?.glb), // Include singular form
            task_error: statusData.task_error || null,
            provider: statusData.provider || "meshy",
          });
        }
        
        // If webhook is recent, use it
        if (age < WEBHOOK_TIMEOUT_MS) {
          console.log(`[Status] Using webhook data for ${taskId} (age: ${age}ms)`);
          return NextResponse.json({
            progress: statusData.progress || 0,
            status: statusData.status || "UNKNOWN",
            model_urls: statusData.model_urls || {},
            model_url: statusData.model_url || (statusData.model_urls?.glb), // Include singular form
            task_error: statusData.task_error || null,
            provider: statusData.provider || "meshy",
          });
        }
        
        console.warn(`[Status] Webhook data stale for ${taskId} (age: ${age}ms), falling back to API`);
        shouldFallbackToAPI = true;
      }
    } else {
      console.log(`[Status] No webhook data found for ${taskId}, falling back to API`);
      shouldFallbackToAPI = true;
    }

    // Fallback to direct API call if webhook is missing or stale
    if (shouldFallbackToAPI && MESHY_API_KEY) {
      console.log(`[Status] Fetching from Meshy API for ${taskId}`);
      
      // Try image-to-3D endpoint first
      let statusUrl = `https://api.meshy.ai/openapi/v2/image-to-3d/${taskId}`;
      let statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
      });

      // If not found, try text-to-3D endpoint
      if (statusRes.status === 404) {
        statusUrl = `https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`;
        statusRes = await fetch(statusUrl, {
          headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
        });
      }

      if (statusRes.ok) {
        const apiData = await statusRes.json();
        
        // Save to GCS for next time
        const fallbackData = {
          ...apiData,
          lastUpdated: new Date().toISOString(),
          receivedViaAPI: true,
        };
        
        await taskFile.save(JSON.stringify(fallbackData, null, 2), {
          metadata: { contentType: "application/json" },
        });
        console.log(`[Status] ✓ Fetched and cached from API`);
        
        return NextResponse.json({
          progress: apiData.progress || 0,
          status: apiData.status || "UNKNOWN",
          model_urls: apiData.model_urls || {},
          model_url: apiData.model_url || (apiData.model_urls?.glb), // Include singular form
          task_error: apiData.task_error || null,
          provider: apiData.provider || "meshy",
        });
      }
      
      console.error(`[Status] API fetch failed: ${statusRes.status}`);
    }

    // If we reach here, return NOT_STARTED
    return NextResponse.json({ 
      progress: 0, 
      status: "NOT_STARTED" 
    });
  } catch (error) {
    console.error("Error reading status:", error);
    return NextResponse.json(
      { error: "Failed to read status" },
      { status: 500 }
    );
  }
}

