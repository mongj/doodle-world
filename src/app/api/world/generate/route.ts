import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const API_BASE_URL = "https://marble2-kgw-prod-iac1.wlt-ai.art/api/v1";
const BEARER_TOKEN = process.env.MARBLE_API_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
    const textPromptRaw = formData.get("textPrompt") as string | null;
    const textPrompt =
      typeof textPromptRaw === "string" && textPromptRaw.trim().length > 0
        ? textPromptRaw.trim()
        : null;
    const model = (formData.get("model") as string) || "Marble 0.1-mini";

    // Require image; text is optional when image is provided
    if (!image) {
      return NextResponse.json(
        { error: "Image is required to generate a world" },
        { status: 400 }
      );
    }

    // Encode image to base64 if provided
    let imageBase64: string | null = null;
    let extension: string | null = null;

    if (image) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const inputImageBase64 = buffer.toString("base64");
      extension = image.name.split(".").pop() || "jpg";

      // Determine MIME type
      let mimeType = "image/png";
      if (extension === "png") mimeType = "image/png";
      else if (extension === "jpg" || extension === "jpeg")
        mimeType = "image/jpeg";
      else if (extension === "gif") mimeType = "image/gif";
      else if (extension === "webp") mimeType = "image/webp";

      // Call Gemini 2.5 image API to generate new image; include text only if provided
      if (GEMINI_API_KEY) {
        try {
          const parts: any[] = [
            {
              inlineData: {
                mime_type: mimeType,
                data: inputImageBase64,
              },
            },
          ];
          if (textPrompt) {
            parts.push({ text: textPrompt });
          }

          const geminiResponse = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
            {
              method: "POST",
              headers: {
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts,
                  },
                ],
              }),
            }
          );

          if (geminiResponse.ok) {
            const geminiResult = await geminiResponse.json();

            // Extract the generated image from Gemini response
            const parts = geminiResult.candidates?.[0]?.content?.parts;
            if (parts) {
              const imagePart = parts.find(
                (part: any) => part.inlineData?.data
              );

              if (imagePart) {
                imageBase64 = imagePart.inlineData.data;
                // Update extension based on Gemini output
                if (imagePart.inlineData.mime_type === "image/png") {
                  extension = "png";
                } else if (imagePart.inlineData.mime_type === "image/jpeg") {
                  extension = "jpg";
                }
              }
            }
          } else {
            console.error("Gemini API error:", await geminiResponse.text());
            // Fall back to using the original image
            imageBase64 = inputImageBase64;
          }
        } catch (geminiError) {
          console.error("Error calling Gemini API:", geminiError);
          // Fall back to using the original image
          imageBase64 = inputImageBase64;
        }
      } else {
        // No Gemini API key, use original image
        imageBase64 = inputImageBase64;
      }
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
          text_prompt: textPrompt && textPrompt.length > 0 ? textPrompt : null,
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
      prompt: textPrompt || "",
      error: null,
      output: null,
    };

    // Store in file system for persistence
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
