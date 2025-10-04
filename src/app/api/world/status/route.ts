import { proxyMarbleCdnUrl } from "@/utils/cdn-proxy";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const API_BASE_URL = "https://marble2-kgw-prod-iac1.wlt-ai.art/api/v1";
const BEARER_TOKEN = process.env.MARBLE_API_TOKEN;

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

    const jobsDir = path.join(process.cwd(), "jobs");
    const jobPath = path.join(jobsDir, `${jobId}.json`);

    // Check if job exists locally
    if (!fs.existsSync(jobPath)) {
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

    // Update local job data
    const localJob = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
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
            const jobData = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
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

            fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));
          })
          .catch((err) => {
            console.error("Mesh conversion failed:", err);
            const jobData = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
            jobData.meshConversionStatus = "failed";
            fs.writeFileSync(jobPath, JSON.stringify(jobData, null, 2));
          });
      }
    }

    fs.writeFileSync(jobPath, JSON.stringify(updatedJob, null, 2));

    // Return status info with proxied CDN URLs
    const output = result.generation_output
      ? {
          ...result.generation_output,
          ply_url: proxyMarbleCdnUrl(result.generation_output.ply_url),
          collider_mesh_url: proxyMarbleCdnUrl(
            result.generation_output.collider_mesh_url
          ),
          image_prompt_url: proxyMarbleCdnUrl(
            result.generation_output.image_prompt_url
          ),
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
      convertedMeshUrl: proxyMarbleCdnUrl(updatedJob.convertedMeshUrl),
    });
  } catch (error) {
    console.error("Error checking job status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
