import { NextRequest, NextResponse } from "next/server";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const TEXT_TO_3D_URL = "https://api.meshy.ai/openapi/v2/text-to-3d";

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

    return NextResponse.json({ result: taskId });
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

    if (!MESHY_API_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Check if webhook has already updated this task's status
    const fs = await import('fs');
    const path = await import('path');
    const taskFilePath = path.join(process.cwd(), "meshy_tasks", `${taskId}.json`);
    
    if (fs.existsSync(taskFilePath)) {
      try {
        const cachedContent = fs.readFileSync(taskFilePath, "utf-8");
        const cachedData = JSON.parse(cachedContent);
        
        if (cachedData.receivedViaWebhook) {
          console.log(`[Text-to-3D] Using webhook data for task ${taskId}`);
          return NextResponse.json(cachedData);
        }
      } catch (err) {
        console.error("Error reading webhook cache:", err);
      }
    }

    // No webhook data yet, fetch from Meshy API
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

