import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const TEXT_TO_3D_URL = "https://api.meshy.ai/openapi/v2/text-to-3d";
const TRIPO3D_API_KEY = process.env.TRIPO3D_API_KEY;
const GCS_BUCKET_NAME = "doodle-world-static";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tripo3D API functions for text-to-model
async function createTripo3DTextTask(prompt: string): Promise<string | null> {
  if (!TRIPO3D_API_KEY) {
    console.log("[Tripo3D Text] API key not configured");
    return null;
  }

  try {
    console.log("[Tripo3D Text] Creating task with prompt:", prompt);
    
    const response = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TRIPO3D_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "text_to_model",
        prompt: prompt,
        face_limit: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Tripo3D Text] Create task failed:", errorText);
      return null;
    }

    const data = await response.json();
    const taskId = data.data?.task_id;
    
    if (taskId) {
      console.log("[Tripo3D Text] Task created:", taskId);
      return taskId;
    }
    
    console.error("[Tripo3D Text] No task_id in response:", data);
    return null;
  } catch (error) {
    console.error("[Tripo3D Text] Error creating task:", error);
    return null;
  }
}

async function pollTripo3DTextTask(taskId: string, originalMeshyId: string, meshyLastProgress: number = 0, maxAttempts: number = 80): Promise<any> {
  console.log("[Tripo3D Text] Starting to poll task:", taskId);
  console.log("[Tripo3D Text] Meshy stopped at:", meshyLastProgress, "% - will map Tripo3D progress to", meshyLastProgress, "-100%");
  
  const storage = getStorage();
  const bucket = storage.bucket(GCS_BUCKET_NAME);
  // Update the ORIGINAL Meshy task file so frontend polling continues to work
  const file = bucket.file(`meshy_tasks/${originalMeshyId}.json`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(
        `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
        {
          headers: {
            "Authorization": `Bearer ${TRIPO3D_API_KEY}`,
          },
        }
      );

      if (!response.ok) {
        console.error(`[Tripo3D Text] Status check failed: ${response.status}`);
        await sleep(3000);
        continue;
      }

      const data = await response.json();
      const task = data.data;
      
      if (!task) {
        console.error("[Tripo3D Text] No task data in response");
        await sleep(3000);
        continue;
      }

      console.log(`[Tripo3D Text] Task status: ${task.status}, progress: ${task.progress}%`);

      // Map Tripo3D progress to continue from where Meshy left off
      // Formula: displayed = meshyLast + (tripo3d * (100 - meshyLast) / 100)
      const tripo3dProgress = task.progress || 0;
      const mappedProgress = Math.round(meshyLastProgress + (tripo3dProgress * (100 - meshyLastProgress) / 100));
      
      console.log(`[Tripo3D Text] Raw progress: ${tripo3dProgress}% → Mapped progress: ${mappedProgress}%`);

      // Update the original Meshy task file with Tripo3D status
      const currentStatus: any = {
        result: originalMeshyId, // Keep the original ID for frontend
        tripo3d_task_id: taskId,
        status: task.status === "success" ? "SUCCEEDED" : 
                task.status === "failed" ? "FAILED" : "IN_PROGRESS",
        progress: mappedProgress,
        raw_tripo3d_progress: tripo3dProgress,
        provider: "tripo3d",
        switched_to_tripo3d: true,
        updated_at: new Date().toISOString(),
      };

      if (task.status === "success") {
        // Tripo3D returns the GLB in pbr_model field
        const glbUrl = task.output?.pbr_model || task.output?.base_model || task.output?.model;
        const previewUrl = task.output?.rendered_image;
        
        console.log(`[Tripo3D Text] GLB URL: ${glbUrl}`);
        console.log(`[Tripo3D Text] Preview URL: ${previewUrl}`);
        
        if (glbUrl) {
          // Ensure completion status and 100% progress
          currentStatus.status = "SUCCEEDED";
          currentStatus.progress = 100;
          currentStatus.model_urls = {
            glb: glbUrl,
            ...(previewUrl && { thumbnail_url: previewUrl }),
          };
          await file.save(JSON.stringify(currentStatus, null, 2), {
            metadata: { contentType: "application/json" },
          });
          console.log("[Tripo3D Text] Task completed successfully - Status: SUCCEEDED, Progress: 100%");
          return task;
        } else {
          console.error("[Tripo3D Text] Task succeeded but no GLB URL found in output!");
          console.error("[Tripo3D Text] Output:", task.output);
        }
      }

      if (task.status === "failed") {
        currentStatus.task_error = {
          message: "Tripo3D text generation failed",
        };
        await file.save(JSON.stringify(currentStatus, null, 2), {
          metadata: { contentType: "application/json" },
        });
        throw new Error("Tripo3D text task failed");
      }

      // Only write for in-progress status
      if (task.status !== "success") {
        await file.save(JSON.stringify(currentStatus, null, 2), {
          metadata: { contentType: "application/json" },
        });
      }
      await sleep(3000);
    } catch (error) {
      console.error("[Tripo3D Text] Error polling task:", error);
      throw error;
    }
  }

  throw new Error("Tripo3D text task timeout");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, prompt, art_style, ai_model, preview_task_id, enable_pbr } = body;

    if (!MESHY_API_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Validate based on mode
    if (mode === "preview") {
      if (!prompt) {
        return NextResponse.json(
          { error: "Missing prompt for preview mode" },
          { status: 400 }
        );
      }
    } else if (mode === "refine") {
      if (!preview_task_id) {
        return NextResponse.json(
          { error: "Missing preview_task_id for refine mode" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid mode. Must be 'preview' or 'refine'" },
        { status: 400 }
      );
    }

    // Create the task
    const createRes = await fetch(TEXT_TO_3D_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        prompt,
        art_style,
        ai_model,
        preview_task_id,
        enable_pbr,
        should_remesh: true,
        moderation: false,
      }),
    });

    const createJson = await createRes.json();

    console.log(`Meshy Text-to-3D ${mode} response:`, createJson);

    if (!createRes.ok) {
      return NextResponse.json(
        { error: createJson?.error || `Meshy ${mode} create failed` },
        { status: createRes.status || 500 }
      );
    }

    const taskId: string | undefined = createJson?.result;
    if (!taskId) {
      return NextResponse.json(
        { error: createJson?.error || JSON.stringify(createJson) },
        { status: 502 }
      );
    }

    // Initialize status file with PENDING status (use task-specific file)
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const taskFile = bucket.file(`meshy_tasks/${taskId}.json`);
    const initialStatus = {
      result: taskId,
      status: "PENDING",
      progress: 0,
      provider: "meshy",
      mode: mode,
      prompt: prompt, // Save prompt for potential fallback
      created_at: new Date().toISOString(),
    };
    await taskFile.save(JSON.stringify(initialStatus, null, 2), {
      metadata: { contentType: "application/json" },
    });

    console.log(`[Meshy Text] Task created with ID: ${taskId}. Webhook will provide updates.`);

    // Start a background task to check for timeout and fallback to Tripo3D
    // Only for preview mode (refine mode is Meshy-specific)
    if (mode === "preview") {
      setTimeout(async () => {
        try {
          console.log("[Fallback Text] Starting 10-second timeout timer for Meshy task:", taskId);
          
          // Wait 10 seconds
          await sleep(10000);
          
          // Check if Meshy task completed
          const storage = getStorage();
          const bucket = storage.bucket(GCS_BUCKET_NAME);
          const meshyTaskFile = bucket.file(`meshy_tasks/${taskId}.json`);
          let currentStatus: any = {};
          
          try {
            const [exists] = await meshyTaskFile.exists();
            if (exists) {
              const [content] = await meshyTaskFile.download();
              currentStatus = JSON.parse(content.toString("utf-8"));
            }
          } catch (err) {
            console.log("[Fallback Text] Could not read status file");
          }
          
          // If Meshy succeeded or is still in progress with high confidence, don't fallback
          if (currentStatus.status === "SUCCEEDED") {
            console.log("[Fallback Text] Meshy completed successfully, no fallback needed");
            return;
          }
          
          if (currentStatus.status === "IN_PROGRESS" && currentStatus.progress > 80) {
            console.log("[Fallback Text] Meshy is almost done (>80%), waiting for it to complete");
            return;
          }
          
          // Meshy didn't complete or failed - fallback to Tripo3D
          console.log("[Fallback Text] Meshy did not complete in 10 seconds, falling back to Tripo3D");
          console.log(`[Fallback Text] Current Meshy status: ${currentStatus.status}, progress: ${currentStatus.progress}%`);
          
          if (!TRIPO3D_API_KEY) {
            console.log("[Fallback Text] Tripo3D API key not configured, cannot fallback");
            return;
          }
          
          // Get the original prompt
          const originalPrompt = currentStatus.prompt || prompt;
          if (!originalPrompt) {
            console.error("[Fallback Text] No prompt available for fallback");
            return;
          }
          
          // Create Tripo3D task
          const tripo3dTaskId = await createTripo3DTextTask(originalPrompt);
          
          if (!tripo3dTaskId) {
            console.error("[Fallback Text] Failed to create Tripo3D task");
            return;
          }
          
          console.log("[Fallback Text] Tripo3D task created:", tripo3dTaskId);
          
          // Save the progress Meshy reached before switching
          const meshyLastProgress = currentStatus.progress || 0;
          console.log("[Fallback Text] Meshy last progress:", meshyLastProgress, "%");
          
          // Update the original Meshy file to show we're now using Tripo3D
          await meshyTaskFile.save(
            JSON.stringify({
              ...currentStatus,
              result: taskId, // Keep original Meshy ID
              tripo3d_task_id: tripo3dTaskId,
              status: "IN_PROGRESS",
              progress: Math.max(meshyLastProgress, 5), // Don't go backwards
              meshy_last_progress: meshyLastProgress,
              provider: "tripo3d",
              switched_to_tripo3d: true,
              fallback_reason: "Meshy timeout after 10 seconds",
              switched_at: new Date().toISOString(),
            }, null, 2),
            { metadata: { contentType: "application/json" } }
          );
          
          // Poll Tripo3D task (updates the same file with progress)
          await pollTripo3DTextTask(tripo3dTaskId, taskId, meshyLastProgress);
          
        } catch (error) {
          console.error("[Fallback Text] Error during fallback process:", error);
        }
      }, 0);
    }

    return NextResponse.json({ 
      result: taskId,
      provider: "meshy",
      message: mode === "preview" 
        ? "Task created. Will fallback to Tripo3D if not completed in 10 seconds."
        : "Task created."
    });
  } catch (error) {
    console.error("Error processing text-to-3D request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing task id" },
        { status: 400 }
      );
    }

    // Check if we have a status file (either from webhook or Tripo3D polling)
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const taskFile = bucket.file(`meshy_tasks/${taskId}.json`);
    
    const [exists] = await taskFile.exists();
    if (exists) {
      try {
        const [cachedContent] = await taskFile.download();
        const cachedData = JSON.parse(cachedContent.toString("utf-8"));
        
        // If task was switched to Tripo3D, return Tripo3D status
        if (cachedData.switched_to_tripo3d) {
          console.log(`[Text-to-3D] Using Tripo3D status for task ${taskId}`);
          return NextResponse.json(cachedData);
        }
        
        // If webhook updated it, use webhook data
        if (cachedData.receivedViaWebhook) {
          console.log(`[Text-to-3D] Using webhook data for task ${taskId}`);
          return NextResponse.json(cachedData);
        }
        
        // Otherwise, return cached data if it exists
        if (cachedData.status && cachedData.status !== "PENDING") {
          console.log(`[Text-to-3D] Using cached status for task ${taskId}`);
          return NextResponse.json(cachedData);
        }
      } catch (err) {
        console.error("Error reading status file:", err);
      }
    }

    // No cached data yet, fetch from Meshy API
    if (!MESHY_API_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    console.log(`[Text-to-3D] Fetching from Meshy API for task ${taskId}`);
    const statusUrl = `${TEXT_TO_3D_URL}/${taskId}`;
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });

    const statusJson = await statusRes.json();

    if (!statusRes.ok) {
      return NextResponse.json(
        { error: statusJson?.error || "Meshy status check failed" },
        { status: statusRes.status || 500 }
      );
    }

    return NextResponse.json(statusJson);
  } catch (error) {
    console.error("Error checking task status:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}


