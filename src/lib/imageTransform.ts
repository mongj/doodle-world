// Image transformation helper using Gemini Images API.
// If no prompt is provided, returns the original bytes unchanged.

export type ImageTransformRequest = {
  imageBytes: Uint8Array;
  mimeType: string; // e.g. "image/png" or "image/jpeg"
  prompt?: string; // optional; if empty, no transform is applied
};

type GeminiConfig = {
  apiKey: string | undefined;
  modelId: string;
};

function getGeminiConfig(): GeminiConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    // Default to a reasonable image model; adjust via env if needed.
    // See: https://ai.google.dev/gemini-api/docs/image-generation
    modelId:
      process.env.GEMINI_IMAGE_MODEL_ID ||
      process.env.GEMINI_MODEL_ID ||
      "imagen-3.0-generate",
  };
}

export async function transformImageWithGemini(
  req: ImageTransformRequest
): Promise<Uint8Array> {
  // If no prompt is supplied, skip remote call and return original bytes.
  if (!req.prompt || !req.prompt.trim()) {
    return req.imageBytes;
  }

  const { apiKey, modelId } = getGeminiConfig();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to generate images");
  }

  const inputB64 = Buffer.from(req.imageBytes).toString("base64");

  // Endpoint: https://generativelanguage.googleapis.com/v1beta/images:generate
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/images:generate";

  const body: any = {
    model: modelId,
    prompt: req.prompt,
    image: {
      data: inputB64,
      mimeType: req.mimeType,
    },
  };

  try {
    console.log("[gemini] Request → Images.generate", {
      endpoint,
      modelId,
      mimeType: req.mimeType,
      promptPreview: (req.prompt || "").slice(0, 120),
      imageBase64Length: inputB64.length,
    });
  } catch {}

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let payload: any = undefined;
  try {
    payload = await res.json();
  } catch {
    throw new Error(
      `Gemini Images API response was not JSON (status ${res.status})`
    );
  }

  if (!res.ok) {
    const errMsg =
      payload?.error?.message ||
      payload?.error ||
      payload?.message ||
      `status ${res.status}`;
    console.error("[gemini] Response ← Images.generate (ERROR)", {
      status: res.status,
      ok: res.ok,
      error: errMsg,
    });
    throw new Error(`Gemini image generation failed: ${errMsg}`);
  }

  const outB64: string | undefined =
    payload?.images?.[0]?.data ||
    payload?.generatedImages?.[0]?.data ||
    payload?.data?.imageBase64 ||
    payload?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inline_data)
      ?.inline_data?.data;

  if (!outB64) {
    console.error("[gemini] Response missing image data", {
      keys: Object.keys(payload || {}),
    });
    throw new Error("Gemini image generation response missing image data");
  }

  return Uint8Array.from(Buffer.from(outB64, "base64"));
}

