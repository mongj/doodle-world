import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://marble2-kgw-prod-iac1.wlt-ai.art/api/v1";
const BEARER_TOKEN = process.env.MARBLE_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    if (!BEARER_TOKEN) {
      return NextResponse.json(
        { error: "MARBLE_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const textPrompt = formData.get("textPrompt") as string;
    const model = (formData.get("model") as string) || "Marble 0.1-mini";

    if (!textPrompt) {
      return NextResponse.json(
        { error: "Text prompt is required" },
        { status: 400 }
      );
    }

    // Encode image to base64 if provided
    let imageBase64: string | null = null;
    let extension: string | null = null;

    if (image) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      imageBase64 = buffer.toString("base64");
      extension = image.name.split(".").pop() || "jpg";
    }

    // Construct request body matching Marble API spec
    const body = {
      id: "",
      display_name: null,
      status: "PENDING",
      owner_id: null,
      created_at: 0,
      updated_at: 0,
      generation_input: {
        seed: null,
        model: model,
        prompt: {
          text_prompt: textPrompt,
          image_prompt: imageBase64
            ? {
                data_base64: imageBase64,
                extension: extension,
              }
            : null,
          is_pano: false,
        },
      },
      permission: {
        public: true,
      },
    };

    // Call Marble API to create world
    const response = await fetch(`${API_BASE_URL}/worlds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Marble API error:", errorData);
      return NextResponse.json(
        { error: "Failed to create world generation job" },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Store job in global state
    const jobId = result.id;
    const jobData = {
      id: jobId,
      status: result.status,
      createdAt: Date.now(),
      model: model,
      prompt: textPrompt,
      error: null,
      output: null,
    };

    // Store in file system for persistence
    const fs = require("fs");
    const path = require("path");
    const jobsDir = path.join(process.cwd(), "jobs");

    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(jobData, null, 2)
    );

    return NextResponse.json({
      jobId: jobId,
      status: result.status,
      message: "World generation started",
    });
  } catch (error) {
    console.error("Error generating world:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
