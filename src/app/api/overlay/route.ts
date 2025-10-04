import { NextRequest } from "next/server";
import { applyOverlayWithProvider } from "@/lib/overlayProvider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // uses Buffer / Node APIs

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const overlayText = (form.get("overlayText") ?? "").toString();

    if (!file || !(file instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: "Missing image file under 'image' field" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    if (!overlayText) {
      return new Response(
        JSON.stringify({ error: "Missing 'overlayText' field" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const mimeType = (file as any).type || "image/png";
    const arrayBuffer = await (file as Blob).arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const outputBytes = await applyOverlayWithProvider({
      imageBytes: bytes,
      overlayText,
      mimeType,
    });

    const base64 = Buffer.from(outputBytes).toString("base64");
    return new Response(
      JSON.stringify({ imageBase64: base64, mimeType }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

