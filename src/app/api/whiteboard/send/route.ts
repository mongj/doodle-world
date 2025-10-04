import { NextRequest, NextResponse } from "next/server";
import { transformImageWithGemini } from "@/lib/imageTransform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  // Expecting format: data:<mime>;base64,<data>
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL: expected base64-encoded image");
  }
  const mimeType = match[1];
  const base64 = match[2];
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return { mimeType, bytes };
}

export async function POST(request: NextRequest) {
  try {
    const { image_url, prompt } = await request.json();

    if (!image_url || typeof image_url !== "string") {
      return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
    }

    // Decode input image
    const { mimeType, bytes } = decodeDataUrl(image_url);

    // Transform only if prompt provided; otherwise passthrough
    const outputBytes = await transformImageWithGemini({
      imageBytes: bytes,
      mimeType,
      prompt: typeof prompt === "string" ? prompt : undefined,
    });

    const finalBase64 = Buffer.from(outputBytes).toString("base64");
    const finalImageUrl = `data:${mimeType};base64,${finalBase64}`;

    // Return final image; downstream 3D step will be backfilled later
    return NextResponse.json({
      status: "FINAL_IMAGE_READY",
      final_image_url: finalImageUrl,
      final_image_mime: mimeType,
    });
  } catch (error: any) {
    console.error("Error transforming image:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process image" },
      { status: 500 }
    );
  }
}
