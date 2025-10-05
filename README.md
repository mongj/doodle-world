<div align="center">

# Doodle World

Turn your imagination into physics-enabled, photorealistic 3D worlds you can walk through — from a doodle, a photo, or a sentence.

</div>

---

## ✨ What is this?

Doodle World is a real‑time imagination compiler: you sketch, describe, or drop in a photo, and the browser synthesizes a living space you can walk through, interact with, and score with an AI‑composed soundtrack. It’s a fusion layer where neural rendering, WebAssembly physics, and multi‑model generative AI cooperate to turn raw ideas into spatial experiences in under a minute.

At its core, Doodle World unifies four hard problems into one fluid pipeline:

- Photorealistic scene synthesis via **Gaussian Splats**, letting environments look like captured reality (not plastic game assets) while streaming efficiently to the GPU.
- Deterministic, high‑throughput **WASM physics (Rapier)** with a fixed‑timestep loop, CCD, and player + object controllers so spaces feel tactile and honest.
- A resilient, multi‑model **AI content stack** — **Gemini** enriches sketches into depth‑aware images; **Meshy** generates preview and refined PBR models; **Tripo3D** auto‑takes over at the 10s mark if needed, with progress mapped so the UX never stutters.
- Context‑aware **generative music** via **ElevenLabs**, composing world‑specific ambience that glues mood to matter.

From a user’s perspective: draw it, type it, or upload it — and a minute later you’re there, in first‑person, grabbing objects, tossing them, hearing them bounce, and exploring an environment that didn’t exist a moment ago. From an engineer’s perspective: it’s a micro game engine + AI studio that runs entirely client‑side, COEP/COOP/CORP‑compliant, with neural rendering for visuals, PDAL‑derived GLB colliders for physics, and a hybrid webhook/polling status fabric that makes long‑running generation feel instantaneous.

In short: Doodle World transforms creativity into navigable reality — not just a 3D viewer, but a continuously compiling world where your ideas become places.

---

## 🧠 High-level Architecture

```
User Input (draw / image / text)
        │
        ▼
Gemini 2.5 Flash (sketch enhancement)
        │
        ▼
Meshy AI (primary 3D generation) ──┐
        │                          │
   [10s timeout]                   │
        │                          │
        └──► Tripo3D (fallback) ◄──┘  ← seamless, no UI jump
        │
        ▼
GLB model + Gaussian Splat world + Generated music (ElevenLabs)
        │
        ▼
Three.js + Rapier + Spark (splat renderer) in browser
```

Key properties:

- Intelligent **provider switching** after 10s (Meshy → Tripo3D) with **progress mapping** so the bar never jumps backwards
- **Webhook + polling hybrid** for resilient status updates
- **Dual representation**: visual splats for beauty, meshed colliders (GLB) for physics
- **COEP/COOP/CORP-compliant** for WASM + SharedArrayBuffer in the browser

---

## 🧩 Major Components

### 1) 3D Engine (client-only)

- **Three.js** for rendering
- **@sparkjsdev/spark** for Gaussian Splat rendering (.spz)
- **Rapier (WASM)** for physics (fixed-timestep loop @ 60Hz)
- **PointerLock controls** (FPS camera), object grabbing/rotation/throw
- **Spatial audio** (Web Audio API) with velocity-based pitch and distance attenuation

### 2) AI Generation Pipeline

- **Gemini 2.5 Flash Image**: enhances doodles into depth-aware inputs
- **Meshy AI**: primary text-to-3D and image-to-3D
  - two-stage text pipeline: preview → refine (PBR textures)
- **Tripo3D**: automatic fallback after **10s** if Meshy hasn’t progressed
  - we map Tripo3D 0–100% to whatever Meshy last reported (e.g. 45–100%)

### 3) World Generation (Marble)

- We use **Marble World Labs** to generate **Gaussian Splats (.spz)** for photorealistic environments
- We **post-process** point clouds → **GLB** colliders via a PDAL microservice
  - PDAL pipeline: `readers.ply` → `filters.delaunay` → `writers.gltf`
  - Dockerized FastAPI service; uploads GLB to GCS for public access

### 4) Music Generation (ElevenLabs)

- Generates **2-minute** ambient soundtracks per world from prompt context
- Streams response → buffers → uploaded to GCS → assigned to world

---

## 🛠️ Tech Stack

**Languages**: TypeScript, JavaScript, Python, CSS

**Frontend**: Next.js 15 (App Router, Turbopack), React 19, Tailwind v4

**3D/Physics**: Three.js r180, Rapier (WASM), Spark (Gaussian Splats)

**Whiteboard**: tldraw 4.x

**AI Providers**: Meshy AI, Tripo3D, Google Gemini 2.5 Flash (image), ElevenLabs (music)

**Cloud/Storage/CDN**: Google Cloud Storage, Marble CDN, Tripo3D CDN, Meshy CDN

**Infra**: Next.js API routes, PDAL + FastAPI microservice (Docker), COEP/COOP/CORP headers for WASM

---

## ⚙️ Environment Variables

Create a `.env.local` in the project root:

```env
# Meshy AI API (Primary 3D generation service)
MESHY_API_KEY=your_meshy_api_key
MESHY_IMAGE_TO_3D_URL=https://api.meshy.ai/v2/image-to-3d
MESHY_JOB_STATUS_URL_TEMPLATE=https://api.meshy.ai/v2/image-to-3d/{id}

# Gemini API (Image enhancement - optional but recommended)
GEMINI_API_KEY=your_gemini_api_key

# Tripo3D API (Fallback 3D generation service)
# If Meshy doesn't complete within 10 seconds, automatically fallback to Tripo3D
TRIPO3D_API_KEY=your_tripo3d_api_key

# ElevenLabs Music (optional - generative background music)
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Google Cloud Storage (for music + converted GLB uploads in the PDAL service)
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

**Where to get keys:**

- Meshy AI: https://www.meshy.ai/
- Tripo3D: https://platform.tripo3d.ai/
- Gemini: https://aistudio.google.com/apikey
- ElevenLabs: https://elevenlabs.io/

---

## 🔄 Fallback & Progress Mapping

- We start with Meshy; if **no completion within 10 seconds**, we switch to Tripo3D.
- When switching, we **preserve last progress** and map Tripo3D’s 0–100% into that remaining window.
- Status is tracked in `meshy_tasks/<taskId>.json` (unified file) with a `provider` flag.
- Meshy webhooks are **ignored** after switching (webhook protection) to prevent state races.

---

## 🚀 Getting Started (Local)

1) Install dependencies

```bash
npm install
```

2) Add `.env.local` (see env section)
3) Run dev server

```bash
npm run dev
# http://localhost:3000
```

> Note: Rapier (WASM) requires **COEP/COOP** headers. We set these in `next.config.ts`.

---

## 📡 API Endpoints (App)

### Whiteboard (Image → 3D)

- `POST /api/whiteboard/send` → create 3D task (Gemini → Meshy; fallback: Tripo3D)
- `GET  /api/whiteboard/status?taskId=...` → poll unified status

### Text → 3D

- `POST /api/whiteboard/text` → preview/refine (fallback only for preview stage)

### Model Proxy (CORS/COEP-safe)

- Proxified via Next rewrites to handle external CDNs

### Music

- `POST /api/music/generate` → generates ambient track (ElevenLabs) and uploads to GCS

---

## 🧪 PDAL Microservice (Optional, for Mesh Colliders)

Located in `/splat-to-mesh/` (Dockerized FastAPI service):

**Pipeline:**

```
readers.ply  →  filters.delaunay  →  writers.gltf (.glb)
```

**Why PDAL?** Splats are neural point primitives (amazing visually), but physics needs triangles. PDAL does the heavy lifting to reconstruct surfaces from millions of points and exports GLB colliders usable by Rapier.

---

## 🧪 Performance Engineering

- **Fixed timestep** physics (60Hz) with accumulator to keep sim deterministic
- **Resource caching**: models, audio buffers, material conversion results
- **Object pooling**: projectiles with hard caps and shared geometries
- **Raycasting throttle** and early exits for hover detection
- **Simplified colliders** (single cuboid) option for large dynamic meshes

---

## 🧭 Folder Structure

```
src/
  app/
    api/
      whiteboard/
        send/route.ts       # image → 3D (Gemini + Meshy; fallback Tripo3D)
        status/route.ts     # unified polling endpoint
        text/route.ts       # text → 3D (preview w/ fallback)
      music/
        generate/route.ts   # ElevenLabs music
    page.tsx                # homepage UI
    globals.css             # Tailwind v4 + custom animations
  components/
    Scene.tsx               # 3D scene, physics, controls, loaders
    Whiteboard.tsx          # tldraw whiteboard modal
    Inventory.tsx           # (extensible) inventory UI
  data/
    preset-worlds.json      # preset worlds (splats + mesh + audio)

splat-to-mesh/              # PDAL + FastAPI microservice for PLY → GLB
```

---

## 🧰 Troubleshooting

**Thumbnails blocked by COEP**

- Ensure URLs use proxied paths or Next.js rewrites handle external CDNs
- Remove `crossOrigin="anonymous"` from plain `<img>` (only needed for Canvas/WebGL reads)

**WASM/SharedArrayBuffer errors**

- Check `next.config.ts` headers: COEP/COOP must be set site-wide
