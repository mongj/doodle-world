#!/usr/bin/env node
// Minimal CLI: reads an input image + prompt, calls Google GenAI Images API, writes out.png
// Usage: node scripts/generate-image.js --image input.png --prompt "a cute cat"

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { image: null, prompt: null, out: 'out.png', model: process.env.GEMINI_IMAGE_MODEL_ID || process.env.GEMINI_MODEL_ID || 'imagen-3.0-generate' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--image' && argv[i+1]) { out.image = argv[++i]; continue; }
    if (a === '--prompt' && argv[i+1]) { out.prompt = argv[++i]; continue; }
    if (a === '--out' && argv[i+1]) { out.out = argv[++i]; continue; }
    if (a === '--model' && argv[i+1]) { out.model = argv[++i]; continue; }
  }
  return out;
}

function guessMime(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function main() {
  const { image, prompt, out, model } = parseArgs(process.argv);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY env var is required');
    process.exit(1);
  }
  if (!image || !prompt) {
    console.error('Usage: node scripts/generate-image.js --image input.png --prompt "your text" [--out out.png] [--model imagen-3.0-generate]');
    process.exit(1);
  }

  const bytes = fs.readFileSync(image);
  const b64 = Buffer.from(bytes).toString('base64');
  const mimeType = guessMime(image);

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/images:generate';
  const body = {
    model,
    prompt,
    image: { data: b64, mimeType },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await res.json();
  } catch (e) {
    console.error('Non-JSON response from Images API; status:', res.status);
    process.exit(2);
  }

  if (!res.ok) {
    console.error('Images API error:', payload?.error?.message || payload?.error || payload?.message || `status ${res.status}`);
    process.exit(3);
  }

  const outB64 = (payload?.images && payload.images[0]?.data)
    || (payload?.generatedImages && payload.generatedImages[0]?.data)
    || (payload?.data && payload.data.imageBase64)
    || (payload?.candidates && payload.candidates[0]?.content?.parts?.find(p => p?.inline_data)?.inline_data?.data);

  if (!outB64) {
    console.error('Could not find image data in response. Keys:', Object.keys(payload || {}));
    process.exit(4);
  }

  fs.writeFileSync(out, Buffer.from(outB64, 'base64'));
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(10);
});

