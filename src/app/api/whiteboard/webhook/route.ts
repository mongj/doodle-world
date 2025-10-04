import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

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

    // Save the status update to a task-specific JSON file
    const statusDir = path.join(process.cwd(), "meshy_tasks");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }

    const taskFilePath = path.join(statusDir, `${taskId}.json`);
    
    // Read existing data if any
    let statusData: any = {};
    if (fs.existsSync(taskFilePath)) {
      try {
        const existing = fs.readFileSync(taskFilePath, "utf-8");
        statusData = JSON.parse(existing);
      } catch (err) {
        console.error("[Meshy Webhook] Error reading existing status:", err);
      }
    }

    // Update with new data from webhook
    statusData = {
      ...statusData,
      ...payload,
      lastUpdated: new Date().toISOString(),
      receivedViaWebhook: true,
    };

    // Write updated status to task-specific file
    fs.writeFileSync(taskFilePath, JSON.stringify(statusData, null, 2));

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

