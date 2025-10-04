# Music Generation API

## Setup

Make sure you have the following environment variable set:

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

You'll also need Google Cloud credentials configured. The application will use the default credentials from your environment (via `gcloud auth application-default login` or a service account key).

## Endpoint

**POST** `/api/music/generate`

### Request Body

```json
{
  "prompt": "Create an intense, fast-paced electronic track for a high-adrenaline video game scene. Use driving synth arpeggios, punchy drums, distorted bass, glitch effects, and aggressive rhythmic textures. The tempo should be fast, 130–150 bpm, with rising tension, quick transitions, and dynamic energy bursts.",
  "musicLengthMs": 10000
}
```

### Request Parameters

- `prompt` (required): Text description of the music you want to generate
- `musicLengthMs` (optional): Length of the music in milliseconds. Defaults to 10000 (10 seconds)

### Response

```json
{
  "success": true,
  "url": "https://storage.googleapis.com/doodle-world-static/music/elevenlabs-1234567890-abc123def456.mp3",
  "filename": "music/elevenlabs-1234567890-abc123def456.mp3",
  "size": 163840,
  "prompt": "Create an intense, fast-paced electronic track...",
  "musicLengthMs": 10000
}
```

## Example Usage

### Using curl

```bash
curl -X POST http://localhost:3000/api/music/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A peaceful ambient track with soft piano and nature sounds",
    "musicLengthMs": 15000
  }'
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch("/api/music/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "Upbeat electronic dance music with energetic beats",
    musicLengthMs: 20000,
  }),
});

const data = await response.json();
console.log("Music URL:", data.url);
```

### Using the ElevenLabs client example from the request

```javascript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient();
const track = await elevenlabs.music.compose({
  prompt:
    "Create an intense, fast-paced electronic track for a high-adrenaline video game scene. Use driving synth arpeggios, punchy drums, distorted bass, glitch effects, and aggressive rhythmic textures. The tempo should be fast, 130–150 bpm, with rising tension, quick transitions, and dynamic energy bursts.",
  musicLengthMs: 10000,
});
```

The API endpoint does this automatically and also handles uploading to GCS and returning the public URL.

## Error Responses

### Missing API Key

```json
{
  "error": "ELEVENLABS_API_KEY not configured"
}
```

### Missing Prompt

```json
{
  "error": "Missing required field: prompt"
}
```

### Generation Failed

```json
{
  "error": "Failed to generate music",
  "details": "Error message details"
}
```
