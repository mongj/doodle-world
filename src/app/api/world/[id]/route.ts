import { proxify } from "@/utils/cdn-proxy";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: worldId } = await params;

    // First check preset worlds
    const presetsPath = path.join(process.cwd(), "src/data/preset-worlds.json");
    if (fs.existsSync(presetsPath)) {
      const presetsContent = fs.readFileSync(presetsPath, "utf-8");
      const presets = JSON.parse(presetsContent);
      const presetWorld = presets.find((w: any) => w.id === worldId);
      if (presetWorld) {
        return NextResponse.json({
          id: presetWorld.id,
          name: presetWorld.name,
          thumbnailUrl: proxify(presetWorld.thumbnailUrl),
          splatUrl: proxify(presetWorld.splatUrl),
          meshUrl: proxify(presetWorld.meshUrl),
          backgroundMusic: proxify(presetWorld.backgroundMusic),
          walkingSound: proxify(presetWorld.walkingSound),
          isPreset: true,
        });
      }
    }

    // Check Google Cloud Storage bucket for job (public bucket)
    try {
      const gcsUrl = `https://storage.googleapis.com/doodle-world-static/jobs/${worldId}.json`;
      const response = await fetch(gcsUrl);

      if (response.ok) {
        const job = await response.json();

        if (job.status === "SUCCEEDED" && job.output) {
          return NextResponse.json({
            id: worldId,
            name: job.prompt || "Generated World",
            thumbnailUrl: proxify(job.output.image_prompt_url) || null,
            splatUrl: proxify(job.output.ply_url),
            meshUrl:
              proxify(job.convertedMeshUrl || job.output.converted_mesh_url) ||
              null,
            backgroundMusic: proxify(job.backgroundMusic),
            walkingSound: proxify(job.walkingSound),
            isPreset: false,
            status: job.status,
            createdAt: job.createdAt,
          });
        } else {
          return NextResponse.json(
            {
              error: "World generation not complete",
              status: job.status,
              id: worldId,
            },
            { status: 400 }
          );
        }
      }
    } catch (gcsError) {
      console.error("Error reading from GCS:", gcsError);
      // Fall through to 404 if GCS read fails
    }

    return NextResponse.json({ error: "World not found" }, { status: 404 });
  } catch (error) {
    console.error("Error fetching world:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
