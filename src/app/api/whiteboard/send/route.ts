import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const CREATE_URL = process.env.MESHY_IMAGE_TO_3D_URL;
const STATUS_TEMPLATE =
  process.env.MESHY_JOB_STATUS_URL_TEMPLATE || `${CREATE_URL}/{id}`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TRIPO3D_API_KEY = process.env.TRIPO3D_API_KEY;
const GCS_BUCKET_NAME = "doodle-world-static";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tripo3D API functions
async function createTripo3DTask(imageUrl: string): Promise<string | null> {
  if (!TRIPO3D_API_KEY) {
    console.log("[Tripo3D] API key not configured");
    return null;
  }

  try {
    console.log("[Tripo3D] Creating task...");
    
    // Check if imageUrl is a data URL (base64) or a regular URL
    let filePayload: any;
    
    if (imageUrl.startsWith('data:')) {
      // Extract base64 data from data URL
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.error("[Tripo3D] Invalid data URL format");
        return null;
      }
      
      console.log("[Tripo3D] Using base64 data directly");
      
      // Send base64 data directly in the task creation
      filePayload = {
        type: "base64",
        data: matches[2], // base64 data without prefix
      };
    } else {
      // Regular URL
      filePayload = {
        type: "url",
        url: imageUrl,
      };
    }
    
    // Create the task with the uploaded image or URL
    const response = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TRIPO3D_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "image_to_model",
        file: filePayload,
        face_limit: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Tripo3D] Create task failed:", errorText);
      return null;
    }

    const data = await response.json();
    const taskId = data.data?.task_id;
    
    if (taskId) {
      console.log("[Tripo3D] Task created:", taskId);
      return taskId;
    }
    
    console.error("[Tripo3D] No task_id in response:", data);
    return null;
  } catch (error) {
    console.error("[Tripo3D] Error creating task:", error);
    return null;
  }
}

async function pollTripo3DTask(taskId: string, originalMeshyId: string, meshyLastProgress: number = 0, maxAttempts: number = 80): Promise<any> {
  console.log("[Tripo3D] Starting to poll task:", taskId);
  console.log("[Tripo3D] Meshy stopped at:", meshyLastProgress, "% - will map Tripo3D progress to", meshyLastProgress, "-100%");
  
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
        console.error(`[Tripo3D] Status check failed: ${response.status}`);
        await sleep(3000);
        continue;
      }

      const data = await response.json();
      const task = data.data;
      
      if (!task) {
        console.error("[Tripo3D] No task data in response");
        await sleep(3000);
        continue;
      }

      console.log(`[Tripo3D] Task status: ${task.status}, progress: ${task.progress}%`);

      // Map Tripo3D progress to continue from where Meshy left off
      // Formula: displayed = meshyLast + (tripo3d * (100 - meshyLast) / 100)
      const tripo3dProgress = task.progress || 0;
      const mappedProgress = Math.round(meshyLastProgress + (tripo3dProgress * (100 - meshyLastProgress) / 100));
      
      console.log(`[Tripo3D] Raw progress: ${tripo3dProgress}% → Mapped progress: ${mappedProgress}%`);

      // Update the original Meshy task file with Tripo3D status
      const currentStatus: any = {
        id: originalMeshyId, // Keep the original ID for frontend
        tripo3d_task_id: taskId,
        status: task.status === "success" ? "SUCCEEDED" : 
                task.status === "failed" ? "FAILED" : "IN_PROGRESS",
        progress: mappedProgress,
        raw_tripo3d_progress: tripo3dProgress,
        provider: "tripo3d",
        switched_to_tripo3d: true,
        updated_at: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        receivedViaWebhook: true, // Mark as valid so status endpoint uses it
      };

      if (task.status === "success") {
        // Tripo3D returns the GLB in pbr_model field
        const glbUrl = task.output?.pbr_model || task.output?.base_model || task.output?.model;
        const previewUrl = task.output?.rendered_image;
        
        console.log(`[Tripo3D] GLB URL: ${glbUrl}`);
        console.log(`[Tripo3D] Preview URL: ${previewUrl}`);
        
        if (glbUrl) {
          // Ensure completion status and 100% progress
          currentStatus.status = "SUCCEEDED";
          currentStatus.progress = 100;
          currentStatus.model_urls = {
            glb: glbUrl,
            ...(previewUrl && { preview: previewUrl }),
          };
          await file.save(JSON.stringify(currentStatus, null, 2), {
            metadata: { contentType: "application/json" },
          });
          console.log("[Tripo3D] Task completed successfully - Status: SUCCEEDED, Progress: 100%");
          return task;
        } else {
          console.error("[Tripo3D] Task succeeded but no GLB URL found in output!");
          console.error("[Tripo3D] Output:", task.output);
        }
      }

      if (task.status === "failed") {
        currentStatus.task_error = {
          message: "Tripo3D generation failed",
        };
        await file.save(JSON.stringify(currentStatus, null, 2), {
          metadata: { contentType: "application/json" },
        });
        throw new Error("Tripo3D task failed");
      }

      // Only write for in-progress status
      if (task.status !== "success") {
        await file.save(JSON.stringify(currentStatus, null, 2), {
          metadata: { contentType: "application/json" },
        });
      }
      await sleep(3000);
    } catch (error) {
      console.error("[Tripo3D] Error polling task:", error);
      throw error;
    }
  }

  throw new Error("Tripo3D task timeout");
}

export async function POST(request: NextRequest) {
  try {
    const { image_url, use_gemini = true, custom_prompt } = await request.json();

    if (!image_url) {
      return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
    }

    if (!MESHY_API_KEY || !CREATE_URL) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Gemini enhancement step
    let enhancedImageUrl = image_url;
    
    if (use_gemini && GEMINI_API_KEY) {
      try {
        console.log("[Gemini] Fetching original image from:", image_url);
        
        // Fetch the image from the provided URL
        const imageResponse = await fetch(image_url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }
        
        // Convert to base64
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString("base64");
        
        // Determine MIME type from URL or headers
        let mimeType = imageResponse.headers.get("content-type") || "image/png";
        if (!mimeType.startsWith("image/")) {
          // Fallback: detect from URL extension
          const urlLower = image_url.toLowerCase();
          if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
            mimeType = "image/jpeg";
          } else if (urlLower.includes(".png")) {
            mimeType = "image/png";
          } else if (urlLower.includes(".webp")) {
            mimeType = "image/webp";
          } else if (urlLower.includes(".gif")) {
            mimeType = "image/gif";
          } else {
            mimeType = "image/png"; // default
          }
        }
        
        console.log("[Gemini] Calling Gemini 2.5 Flash Image API...");
        
        // Use custom prompt or default prompt
        const promptText = custom_prompt || 
          "You will be provided with a doodle. Make a 3d model of it. Give it a lot of depth, it should not look like a flat drawing, but a 4d realistic object. Remove any background.";
        
        console.log("[Gemini] Using prompt:", promptText);
        
        // Call Gemini 2.5 Flash Image API
        const geminiResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
          {
            method: "POST",
            headers: {
              "x-goog-api-key": GEMINI_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        mime_type: mimeType,
                        data: base64Image,
                      },
                    },
                    { 
                      text: promptText
                    },
                  ],
                },
              ],
            }),
          }
        );
        
        if (geminiResponse.ok) {
          const geminiResult = await geminiResponse.json();
          console.log("[Gemini] API call successful");
          
          // Extract the generated image from Gemini response
          const parts = geminiResult.candidates?.[0]?.content?.parts;
          if (parts) {
            const imagePart = parts.find(
              (part: any) => part.inlineData?.data
            );
            
            if (imagePart) {
              const enhancedBase64 = imagePart.inlineData.data;
              const enhancedMimeType = imagePart.inlineData.mime_type || mimeType;
              
              // Convert to data URL
              enhancedImageUrl = `data:${enhancedMimeType};base64,${enhancedBase64}`;
              
              console.log("[Gemini] Successfully generated enhanced 3D image");
            } else {
              console.log("[Gemini] No image data in response, using original");
            }
          } else {
            console.log("[Gemini] No parts in response, using original");
          }
        } else {
          console.error("[Gemini] API error:", await geminiResponse.text());
          console.log("[Gemini] Falling back to original image");
        }
      } catch (geminiError) {
        console.error("[Gemini] Error during enhancement:", geminiError);
        console.log("[Gemini] Falling back to original image");
      }
    } else if (!use_gemini) {
      console.log("[Gemini] Enhancement disabled by user, skipping");
    } else {
      console.log("[Gemini] API key not configured, skipping enhancement");
    }

    // Create Meshy task with enhanced image
    console.log("[Meshy] Sending image to Meshy.ai...");
    const createRes = await fetch(CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        image_url: enhancedImageUrl,
        ai_model: "latest",
        moderation: false,
      }),
    });

    const createJson = await createRes.json();

    console.log("Meshy create response:", createJson);
    if (!createRes.ok) {
      return NextResponse.json(
        { error: createJson?.error || "Meshy create failed" },
        { status: createRes.status || 500 }
      );
    }

    const id: string | undefined = createJson?.result;
    if (!id) {
      return NextResponse.json(
        { error: createJson?.error || JSON.stringify(createJson) },
        { status: 502 }
      );
    }

    // Initialize status file with PENDING status (use task-specific file)
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const taskFile = bucket.file(`meshy_tasks/${id}.json`);
    const initialStatus = {
      id,
      status: "PENDING",
      progress: 0,
      provider: "meshy",
      created_at: new Date().toISOString(),
    };
    await taskFile.save(JSON.stringify(initialStatus, null, 2), {
      metadata: { contentType: "application/json" },
    });

    console.log(`[Meshy] Task created with ID: ${id}. Webhook will provide updates.`);

    // Start a background task to check for timeout and fallback to Tripo3D
    // This doesn't block the response
    setTimeout(async () => {
      try {
        console.log("[Fallback] Starting 10-second timeout timer for Meshy task:", id);
        
        // Wait 10 seconds
        await sleep(10);
        
        // Check if Meshy task completed
        const storage = getStorage();
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const meshyTaskFile = bucket.file(`meshy_tasks/${id}.json`);
        let currentStatus: any = {};
        
        try {
          const [exists] = await meshyTaskFile.exists();
          if (exists) {
            const [content] = await meshyTaskFile.download();
            currentStatus = JSON.parse(content.toString("utf-8"));
          }
        } catch (err) {
          console.log("[Fallback] Could not read status file");
        }
        
        // If Meshy succeeded or is still in progress with high confidence, don't fallback
        if (currentStatus.status === "SUCCEEDED") {
          console.log("[Fallback] Meshy completed successfully, no fallback needed");
          return;
        }
        
        if (currentStatus.status === "IN_PROGRESS" && currentStatus.progress > 80) {
          console.log("[Fallback] Meshy is almost done (>80%), waiting for it to complete");
          return;
        }
        
        // Meshy didn't complete or failed - fallback to Tripo3D
        console.log("[Fallback] Meshy did not complete in 10 seconds, falling back to Tripo3D");
        console.log(`[Fallback] Current Meshy status: ${currentStatus.status}, progress: ${currentStatus.progress}%`);
        
        if (!TRIPO3D_API_KEY) {
          console.log("[Fallback] Tripo3D API key not configured, cannot fallback");
          return;
        }
        
        // Create Tripo3D task
        const tripo3dTaskId = await createTripo3DTask(enhancedImageUrl);
        
        if (!tripo3dTaskId) {
          console.error("[Fallback] Failed to create Tripo3D task");
          return;
        }
        
        console.log("[Fallback] Tripo3D task created:", tripo3dTaskId);
        
        // Save the progress Meshy reached before switching
        const meshyLastProgress = currentStatus.progress || 0;
        console.log("[Fallback] Meshy last progress:", meshyLastProgress, "%");
        
        // Update the original Meshy file to show we're now using Tripo3D
        await meshyTaskFile.save(
          JSON.stringify({
            ...currentStatus,
            id: id, // Keep original Meshy ID
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
        await pollTripo3DTask(tripo3dTaskId, id, meshyLastProgress);
        
      } catch (error) {
        console.error("[Fallback] Error during fallback process:", error);
      }
    }, 0);

    // Return the task ID immediately
    // The webhook will update the status file when the task progresses/completes
    return NextResponse.json({
      id,
      status: "PENDING",
      provider: "meshy",
      message: "Task created. Status updates will be received via webhook. Will fallback to Tripo3D if not completed in 10 seconds.",
    });
  } catch (error) {
    console.error("Error processing image:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
