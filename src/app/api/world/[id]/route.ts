import { proxyMarbleCdnUrl } from "@/utils/cdn-proxy";
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
          thumbnailUrl: proxyMarbleCdnUrl(presetWorld.thumbnailUrl),
          splatUrl: proxyMarbleCdnUrl(presetWorld.splatUrl),
          meshUrl: proxyMarbleCdnUrl(presetWorld.meshUrl),
          backgroundMusic: presetWorld.backgroundMusic,
          isPreset: true,
        });
      }
    }

    // Check jobs directory
    const jobsDir = path.join(process.cwd(), "jobs");
    const jobPath = path.join(jobsDir, `${worldId}.json`);

    if (fs.existsSync(jobPath)) {
      const jobContent = fs.readFileSync(jobPath, "utf-8");
      const job = JSON.parse(jobContent);

      if (job.status === "SUCCEEDED" && job.output) {
        return NextResponse.json({
          id: worldId,
          name: job.prompt || "Generated World",
          thumbnailUrl: proxyMarbleCdnUrl(job.output.image_prompt_url) || null,
          splatUrl: proxyMarbleCdnUrl(job.output.ply_url),
          meshUrl:
            proxyMarbleCdnUrl(
              job.convertedMeshUrl || job.output.converted_mesh_url
            ) || null,
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

    return NextResponse.json({ error: "World not found" }, { status: 404 });
  } catch (error) {
    console.error("Error fetching world:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
