import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds - if webhook is older, fall back to API

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
    const taskFilePath = path.join(process.cwd(), "meshy_tasks", `${taskId}.json`);
    
    let shouldFallbackToAPI = false;
    
    if (fs.existsSync(taskFilePath)) {
      const statusContent = fs.readFileSync(taskFilePath, "utf-8");
      const statusData = JSON.parse(statusContent);

      // Check if webhook data is fresh and complete
      if (statusData.receivedViaWebhook) {
        const lastUpdated = statusData.lastUpdated ? new Date(statusData.lastUpdated).getTime() : 0;
        const age = Date.now() - lastUpdated;
        
        // If webhook is recent and task is terminal state, use it
        if (statusData.status === "SUCCEEDED" || statusData.status === "FAILED" || statusData.status === "EXPIRED") {
          console.log(`[Status] Using webhook data for ${taskId} (terminal state)`);
          return NextResponse.json({
            progress: statusData.progress || 0,
            status: statusData.status || "UNKNOWN",
            model_urls: statusData.model_urls || {},
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
        
        // Save to file for next time
        const statusDir = path.join(process.cwd(), "meshy_tasks");
        if (!fs.existsSync(statusDir)) {
          fs.mkdirSync(statusDir, { recursive: true });
        }
        
        const fallbackData = {
          ...apiData,
          lastUpdated: new Date().toISOString(),
          receivedViaAPI: true,
        };
        
        fs.writeFileSync(taskFilePath, JSON.stringify(fallbackData, null, 2));
        console.log(`[Status] ✓ Fetched and cached from API`);
        
        return NextResponse.json({
          progress: apiData.progress || 0,
          status: apiData.status || "UNKNOWN",
          model_urls: apiData.model_urls || {},
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

