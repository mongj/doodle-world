import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { prompt, image, mimeType = "image/jpeg" } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 }
      );
    }

    console.log("[Gemini] Generating scene description for input:", prompt);
    if (image) {
      console.log("[Gemini] Including image in request");
    }

    // Initialize Gemini API
    const ai = new GoogleGenAI({ vertexai: false, apiKey: GEMINI_API_KEY });

    // Build instruction prompt for world generation
    const instructionPrompt = `You are a world generation assistant. Based on the user's input${
      image ? " and the provided image" : ""
    }, generate a title and detailed description for a 3D world scene.

Your response must follow this exact format:

TITLE: [A brief, descriptive title of the scene]

DESCRIPTION: [A comprehensive and detailed description of the scene that will be used to generate a 3D world. The description should include:
- The overall atmosphere and style (realistic, fantasy, etc.)
- The landscape or environment (terrain, buildings, structures)
- Specific features and objects in the scene
- Textures, materials, and surfaces
- Lighting conditions and colors
- Spatial relationships and layout
- Any notable details that would help create an immersive 3D world]

User input: ${prompt}

Examples of good descriptions:

Example 1 - Mountain Valley:
TITLE: Majestic Mountain Valley at Sunset
DESCRIPTION: The scene is a panoramic landscape of a vast mountainous valley at sunset, captured in a realistic style, evoking a majestic and serene atmosphere with vibrant sky colors. The valley floor is densely forested with evergreen trees, appearing as a dark green carpet stretching into the distance. Towering rock formations with sheer, imposing faces dominate the landscape, sculpted by ancient geological forces. In the far distance, additional layers of mountains rise, their peaks silhouetted against the colorful sky, showing a progression of depth and scale. The sky is ablaze with an intense orange and pink sunset, with clouds scattered across the horizon, illuminated by the low-hanging sun.

Example 2 - Village Courtyard:
TITLE: Tranquil Ancient Village Courtyard
DESCRIPTION: The scene is a tranquil village courtyard, captured in a realistic style, evoking a sense of ancient charm and quiet history. The overall tone is peaceful and timeless, with warm sunlight illuminating weathered stone structures and lush greenery. The courtyard is paved with irregularly shaped cobblestones, radiating outwards from a central stone fountain that features a bowl-shaped basin filled with water. Stone buildings, multi-storied and adorned with climbing vines, encircle the courtyard, creating a secluded atmosphere.

Now generate the title and description:`;

    // Build contents array with instruction and optional image
    const contents: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }> = [{ text: instructionPrompt }];

    // Add image if provided (base64 encoded string)
    if (image) {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    // Generate content using Gemini 2.0 Flash
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents,
    });

    const generatedText = response.text || "";

    // Parse the response to extract title and description
    const titleMatch = generatedText.match(/TITLE:\s*(.+?)(?=\n|$)/i);
    const descriptionMatch = generatedText.match(/DESCRIPTION:\s*([\s\S]+?)$/i);

    let title = "";
    let description = "";

    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
    }

    // Fallback: if parsing failed, try to extract from the raw text
    if (!title || !description) {
      const lines = generatedText.split("\n").filter((line) => line.trim());
      if (lines.length >= 2) {
        title = title || lines[0].replace(/^TITLE:\s*/i, "").trim();
        description =
          description ||
          lines
            .slice(1)
            .join(" ")
            .replace(/^DESCRIPTION:\s*/i, "")
            .trim();
      }
    }

    console.log("[Gemini] Title and description generated successfully");
    console.log("[Gemini] Title:", title);

    return NextResponse.json({
      success: true,
      title,
      description,
      prompt,
      rawText: generatedText, // Include raw text for debugging
    });
  } catch (error) {
    console.error("[Text Completion] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate text completion",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
