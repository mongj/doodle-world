import { NextRequest, NextResponse } from "next/server";

const SPLAT_TO_MESH_API =
  "https://splat-to-mesh-494609107831.us-central1.run.app/convert";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plyUrl, jobId } = body;

    if (!plyUrl) {
      return NextResponse.json(
        { error: "plyUrl is required" },
        { status: 400 }
      );
    }

    console.log(
      `[Mesh Conversion] Starting conversion for job ${jobId}, PLY: ${plyUrl}`
    );

    // Call the splat-to-mesh conversion service
    const response = await fetch(
      `${SPLAT_TO_MESH_API}?url=${encodeURIComponent(plyUrl)}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Mesh conversion error:", errorData);
      return NextResponse.json(
        { error: "Failed to convert PLY to mesh" },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log(`[Mesh Conversion] Completed for job ${jobId}:`, result);

    return NextResponse.json({
      success: true,
      meshUrl: result.meshUrl || result.url || result,
    });
  } catch (error) {
    console.error("Error converting mesh:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
