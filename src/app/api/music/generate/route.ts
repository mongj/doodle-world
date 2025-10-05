import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/utils/gcs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const GCS_BUCKET_NAME = "doodle-world-static";
const MUSIC_LENGTH_MS = 2 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 }
      );
    }

    console.log("[ElevenLabs Music] Generating track with prompt:", prompt);

    // Initialize ElevenLabs client
    const elevenlabs = new ElevenLabsClient({
      apiKey: ELEVENLABS_API_KEY,
    });

    // build prompt
    const musicGenerationPrompt = `Background music for an immersive 3D world. ${prompt}`;

    // Generate music using ElevenLabs
    const track = await elevenlabs.music.compose({
      prompt: musicGenerationPrompt,
      musicLengthMs: MUSIC_LENGTH_MS,
    });

    console.log("[ElevenLabs Music] Track generated successfully");

    // Convert ReadableStream to buffer
    const chunks: Uint8Array[] = [];
    const reader = track.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const audioBuffer = Buffer.concat(chunks);

    console.log(
      `[ElevenLabs Music] Audio buffer size: ${audioBuffer.length} bytes`
    );

    // Generate unique filename
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString("hex");
    const filename = `music/elevenlabs-${timestamp}-${hash}.mp3`;

    // Upload to Google Cloud Storage
    console.log(`[GCS] Uploading to bucket: ${GCS_BUCKET_NAME}/${filename}`);

    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const blob = bucket.file(filename);

    // Upload the buffer
    await blob.save(audioBuffer, {
      metadata: {
        contentType: "audio/mpeg",
      },
    });

    // Make the file publicly accessible
    await blob.makePublic();

    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;

    console.log(`[GCS] File uploaded successfully: ${publicUrl}`);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      size: audioBuffer.length,
      prompt,
      musicLengthMs: MUSIC_LENGTH_MS,
    });
  } catch (error) {
    console.error("[Music Generation] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate music",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
