import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

const GCS_BUCKET_NAME = "doodle-world-static";

/**
 * Webhook endpoint to receive Meshy task status updates
 * Configure this URL in your Meshy dashboard: https://your-domain.com/api/whiteboard/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    console.log("[Meshy Webhook] Received update:", payload);

    // Meshy webhook payload structure typically includes:
    // - id: task ID
    // - status: PENDING, IN_PROGRESS, SUCCEEDED, FAILED, EXPIRED
    // - progress: number (0-100)
    // - model_urls: object with model URLs when succeeded
    // - task_error: error details if failed

    const taskId = payload.id || payload.task_id;
    
    if (!taskId) {
      console.error("[Meshy Webhook] No task ID in payload");
      return NextResponse.json({ error: "Missing task ID" }, { status: 400 });
    }

    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const taskFile = bucket.file(`meshy_tasks/${taskId}.json`);
    
    // Read existing data if any
    let statusData: any = {};
    const [exists] = await taskFile.exists();
    if (exists) {
      try {
        const [content] = await taskFile.download();
        statusData = JSON.parse(content.toString("utf-8"));
      } catch (err) {
        console.error("[Meshy Webhook] Error reading existing status:", err);
      }
    }

    // Check if this task has been switched to Tripo3D
    if (statusData.switched_to_tripo3d) {
      console.log(`[Meshy Webhook] Task ${taskId} has been switched to Tripo3D, ignoring Meshy webhook update`);
      return NextResponse.json({ 
        success: true, 
        message: "Task switched to Tripo3D, webhook ignored" 
      }, { status: 200 });
    }

    // Update with new data from webhook
    statusData = {
      ...statusData,
      ...payload,
      lastUpdated: new Date().toISOString(),
      receivedViaWebhook: true,
    };

    // Write updated status to GCS
    await taskFile.save(JSON.stringify(statusData, null, 2), {
      metadata: { contentType: "application/json" },
    });

    console.log(`[Meshy Webhook] Updated status for task ${taskId}: ${payload.status}`);

    // Return 200 OK to acknowledge receipt
    // This is important - Meshy requires status < 400 to consider delivery successful
    return NextResponse.json({ 
      success: true, 
      message: "Webhook received and processed" 
    }, { status: 200 });

  } catch (error) {
    console.error("[Meshy Webhook] Error processing webhook:", error);
    
    // Still return 200 to prevent webhook retry storms
    // Log the error but acknowledge receipt
    return NextResponse.json({ 
      success: false, 
      error: "Internal error but webhook acknowledged" 
    }, { status: 200 });
  }
}

