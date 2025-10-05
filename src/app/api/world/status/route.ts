import { proxify } from "@/utils/cdn-proxy";
import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

const API_BASE_URL = "https://marble2-kgw-prod-iac1.wlt-ai.art/api/v1";
const BEARER_TOKEN = process.env.MARBLE_API_TOKEN;
const GCS_BUCKET_NAME = "doodle-world-static";

export async function GET(request: NextRequest) {
  try {
    if (!BEARER_TOKEN) {
      return NextResponse.json(
        { error: "MARBLE_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId parameter is required" },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const file = bucket.file(`jobs/${jobId}.json`);

    // Check if job exists in GCS
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Poll Marble API for current status
    const response = await fetch(`${API_BASE_URL}/worlds/${jobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Marble API error:", errorData);
      return NextResponse.json(
        { error: "Failed to fetch job status" },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Update job data from GCS
    const [jobContent] = await file.download();
    const localJob = JSON.parse(jobContent.toString("utf-8"));
    const updatedJob = {
      ...localJob,
      status: result.status,
      error: result.error,
      output: result.generation_output,
      updatedAt: Date.now(),
    };

    // If job just succeeded, handle mesh URL
    if (result.status === "SUCCEEDED" && !updatedJob.meshConversionTriggered) {
      // Check if Marble provided a collider_mesh_url
      if (result.generation_output?.collider_mesh_url) {
        // Use Marble's collider mesh directly
        updatedJob.meshConversionTriggered = true;
        updatedJob.meshConversionStatus = "completed";
        updatedJob.convertedMeshUrl =
          result.generation_output.collider_mesh_url;

        if (updatedJob.output) {
          updatedJob.output.converted_mesh_url =
            result.generation_output.collider_mesh_url;
        }

        console.log(
          `[Status] Using Marble collider mesh: ${result.generation_output.collider_mesh_url}`
        );
      } else if (result.generation_output?.ply_url) {
        // No collider mesh from Marble, trigger our in-house conversion
        updatedJob.meshConversionTriggered = true;
        updatedJob.meshConversionStatus = "pending";

        console.log(
          `[Status] No collider mesh from Marble, triggering in-house conversion for PLY: ${result.generation_output.ply_url}`
        );

        // Trigger mesh conversion asynchronously (don't wait for it)
        fetch(`${request.nextUrl.origin}/api/world/convert-mesh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobId: jobId,
            plyUrl: result.generation_output.ply_url,
          }),
        })
          .then(async (conversionResponse) => {
            const conversionResult = await conversionResponse.json();

            // Update job with converted mesh URL
            const [content] = await file.download();
            const jobData = JSON.parse(content.toString("utf-8"));
            jobData.meshConversionStatus = conversionResponse.ok
              ? "completed"
              : "failed";

            if (conversionResponse.ok && conversionResult.meshUrl) {
              jobData.convertedMeshUrl = conversionResult.meshUrl;
              // Also update the output to include the converted mesh
              if (jobData.output) {
                jobData.output.converted_mesh_url = conversionResult.meshUrl;
              }
            }

            await file.save(JSON.stringify(jobData, null, 2), {
              metadata: { contentType: "application/json" },
            });
          })
          .catch(async (err) => {
            console.error("Mesh conversion failed:", err);
            const [content] = await file.download();
            const jobData = JSON.parse(content.toString("utf-8"));
            jobData.meshConversionStatus = "failed";
            await file.save(JSON.stringify(jobData, null, 2), {
              metadata: { contentType: "application/json" },
            });
          });
      }
    }

    // Trigger music generation if job just succeeded and not already triggered
    if (result.status === "SUCCEEDED" && !updatedJob.musicGenerationTriggered) {
      updatedJob.musicGenerationTriggered = true;
      updatedJob.musicGenerationStatus = "pending";

      const musicPrompt = result.generation_input?.prompt?.text_prompt;

      console.log(
        `[Status] Triggering music generation for job ${jobId} with prompt: ${musicPrompt}`
      );

      // Trigger music generation asynchronously (don't wait for it)
      fetch(`${request.nextUrl.origin}/api/music/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: musicPrompt,
        }),
        })
        .then(async (musicResponse) => {
          const musicResult = await musicResponse.json();

          // Update job with background music URL
          const [content] = await file.download();
          const jobData = JSON.parse(content.toString("utf-8"));
          jobData.musicGenerationStatus = musicResponse.ok
            ? "completed"
            : "failed";

          if (musicResponse.ok && musicResult.url) {
            jobData.backgroundMusic = musicResult.url;
            console.log(
              `[Status] Music generation completed: ${musicResult.url}`
            );
          }

          await file.save(JSON.stringify(jobData, null, 2), {
            metadata: { contentType: "application/json" },
          });
        })
        .catch(async (err) => {
          console.error("Music generation failed:", err);
          const [content] = await file.download();
          const jobData = JSON.parse(content.toString("utf-8"));
          jobData.musicGenerationStatus = "failed";
          await file.save(JSON.stringify(jobData, null, 2), {
            metadata: { contentType: "application/json" },
          });
        });
    }

    await file.save(JSON.stringify(updatedJob, null, 2), {
      metadata: { contentType: "application/json" },
    });

    // Return status info with proxied CDN URLs
    const output = result.generation_output
      ? {
          ...result.generation_output,
          ply_url: proxify(result.generation_output.ply_url),
          collider_mesh_url: proxify(
            result.generation_output.collider_mesh_url
          ),
          image_prompt_url: proxify(result.generation_output.image_prompt_url),
        }
      : null;

    return NextResponse.json({
      jobId: jobId,
      status: result.status,
      error: result.error,
      output: output,
      createdAt: localJob.createdAt,
      updatedAt: updatedJob.updatedAt,
      model: localJob.model,
      prompt: localJob.prompt,
      meshConversionStatus: updatedJob.meshConversionStatus,
      convertedMeshUrl: proxify(updatedJob.convertedMeshUrl),
      musicGenerationStatus: updatedJob.musicGenerationStatus,
      backgroundMusic: updatedJob.backgroundMusic,
    });
  } catch (error) {
    console.error("Error checking job status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
