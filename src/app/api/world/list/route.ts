import { proxify } from "@/utils/cdn-proxy";
import { getStorage } from "@/utils/gcs";
import { NextResponse } from "next/server";

const GCS_BUCKET_NAME = "doodle-world-static";

export async function GET() {
  try {
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    // List all JSON files in the jobs/ directory
    const [files] = await bucket.getFiles({ prefix: "jobs/" });

    const jobs = await Promise.all(
      files
        .filter((file) => file.name.endsWith(".json"))
        .map(async (file) => {
          const [content] = await file.download();
          const job = JSON.parse(content.toString("utf-8"));

          // Proxify URLs in the job output
          if (job.output) {
            // Handle spz_urls object if it exists
            let spz_urls = job.output.spz_urls;
            if (spz_urls && typeof spz_urls === "object") {
              spz_urls = Object.keys(spz_urls).reduce(
                (acc: any, key: string) => {
                  acc[key] = proxify(spz_urls[key]);
                  return acc;
                },
                {}
              );
            }

            job.output = {
              ...job.output,
              cond_image_url: proxify(job.output.cond_image_url),
              posed_cond_image: proxify(job.output.posed_cond_image),
              image_prompt_url: proxify(job.output.image_prompt_url),
              ply_url: proxify(job.output.ply_url),
              collider_mesh_url: proxify(job.output.collider_mesh_url),
              converted_mesh_url: proxify(job.output.converted_mesh_url),
              spz_urls: spz_urls,
            };
          }

          // Proxify top-level URLs
          if (job.convertedMeshUrl) {
            job.convertedMeshUrl = proxify(job.convertedMeshUrl);
          }
          if (job.backgroundMusic) {
            job.backgroundMusic = proxify(job.backgroundMusic);
          }
          if (job.walkingSound) {
            job.walkingSound = proxify(job.walkingSound);
          }

          return job;
        })
    );

    // Sort by creation time, newest first
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error listing jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
