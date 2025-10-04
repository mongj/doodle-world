import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const CREATE_URL = process.env.MESHY_IMAGE_TO_3D_URL;

export async function POST(request: NextRequest) {
  try {
    const { image_url } = await request.json();

    if (!image_url) {
      return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
    }

    if (!MESHY_API_KEY || !CREATE_URL) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Create Meshy task
    const createRes = await fetch(CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        image_url,
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

    // Initialize status file with PENDING status
    const outputPath = path.join(process.cwd(), "meshy_status.json");
    const initialStatus = {
      id,
      status: "PENDING",
      progress: 0,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(initialStatus, null, 2));

    console.log(`[Meshy] Task created with ID: ${id}. Webhook will provide updates.`);

    // Return the task ID immediately
    // The webhook will update the status file when the task progresses/completes
    return NextResponse.json({
      id,
      status: "PENDING",
      message: "Task created. Status updates will be received via webhook.",
    });
  } catch (error) {
    console.error("Error processing image:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
