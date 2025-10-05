import { NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

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
          return JSON.parse(content.toString("utf-8"));
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
