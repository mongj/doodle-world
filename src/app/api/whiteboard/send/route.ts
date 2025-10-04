import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const CREATE_URL = process.env.MESHY_IMAGE_TO_3D_URL;
const STATUS_TEMPLATE =
  process.env.MESHY_JOB_STATUS_URL_TEMPLATE || `${CREATE_URL}/{id}`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // Gemini enhancement step
    let enhancedImageUrl = image_url;
    
    if (GEMINI_API_KEY) {
      try {
        console.log("[Gemini] Fetching original image from:", image_url);
        
        // Fetch the image from the provided URL
        const imageResponse = await fetch(image_url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }
        
        // Convert to base64
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString("base64");
        
        // Determine MIME type from URL or headers
        let mimeType = imageResponse.headers.get("content-type") || "image/png";
        if (!mimeType.startsWith("image/")) {
          // Fallback: detect from URL extension
          const urlLower = image_url.toLowerCase();
          if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
            mimeType = "image/jpeg";
          } else if (urlLower.includes(".png")) {
            mimeType = "image/png";
          } else if (urlLower.includes(".webp")) {
            mimeType = "image/webp";
          } else if (urlLower.includes(".gif")) {
            mimeType = "image/gif";
          } else {
            mimeType = "image/png"; // default
          }
        }
        
        console.log("[Gemini] Calling Gemini 2.5 Flash Image API...");
        
        // Call Gemini 2.5 Flash Image API
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
                  parts: [
                    {
                      inlineData: {
                        mime_type: mimeType,
                        data: base64Image,
                      },
                    },
                    { 
                      text: "You will be provided with a doodle. Make a 3d model of it. Give it a lot of depth, it should not look like a flat drawing, but a 4d realistic objeect." 
                    },
                  ],
                },
              ],
            }),
          }
        );
        
        if (geminiResponse.ok) {
          const geminiResult = await geminiResponse.json();
          console.log("[Gemini] API call successful");
          
          // Extract the generated image from Gemini response
          const parts = geminiResult.candidates?.[0]?.content?.parts;
          if (parts) {
            const imagePart = parts.find(
              (part: any) => part.inlineData?.data
            );
            
            if (imagePart) {
              const enhancedBase64 = imagePart.inlineData.data;
              const enhancedMimeType = imagePart.inlineData.mime_type || mimeType;
              
              // Convert to data URL
              enhancedImageUrl = `data:${enhancedMimeType};base64,${enhancedBase64}`;
              
              console.log("[Gemini] Successfully generated enhanced 3D image");
              
              // Save the enhanced image locally for debugging
              const debugPath = path.join(process.cwd(), "test3d.jpg");
              const imageBuffer = Buffer.from(enhancedBase64, "base64");
              fs.writeFileSync(debugPath, imageBuffer);
              console.log("[Gemini] Saved enhanced image to test3d.jpg");
            } else {
              console.log("[Gemini] No image data in response, using original");
            }
          } else {
            console.log("[Gemini] No parts in response, using original");
          }
        } else {
          console.error("[Gemini] API error:", await geminiResponse.text());
          console.log("[Gemini] Falling back to original image");
        }
      } catch (geminiError) {
        console.error("[Gemini] Error during enhancement:", geminiError);
        console.log("[Gemini] Falling back to original image");
      }
    } else {
      console.log("[Gemini] API key not configured, skipping enhancement");
    }

    // Create Meshy task with enhanced image
    console.log("[Meshy] Sending image to Meshy.ai...");
    const createRes = await fetch(CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        image_url: enhancedImageUrl,
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
