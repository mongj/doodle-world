# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always use context7 to retrieve documentation before making code edits

## Project Overview

Next.js 15 application featuring an interactive 3D scene that integrates **Gaussian Splats** (via Spark), **Rapier Physics**, and **Three.js** to create a first-person physics-based environment with dynamic model loading and AI-powered 3D content generation.

## Development Commands

```bash
# Start development server with Turbopack (http://localhost:3000)
npm run dev

# Build for production with Turbopack
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Architecture

### Core Technologies

The application is built with:
- **Next.js 15** (App Router with React 19)
- **TypeScript**
- **Tailwind CSS v4**
- **Three.js** for 3D scene management
- **@sparkjsdev/spark** for Gaussian Splat rendering
- **@dimforge/rapier3d-compat** for physics simulation

### Client-Side Rendering Requirements

The 3D scene **must be client-side only** due to Three.js and WASM dependencies:
- Uses `'use client'` directive
- Dynamic import with `ssr: false` in page components
- Client-side mounting guard pattern with `mounted` flag
- Whiteboard component dynamically imported with `ssr: false` (line 14)

### Physics System

**Fixed timestep physics loop** independent of render frame rate:
- `FIXED_TIME_STEP = 1/60` (60Hz physics) (line 62)
- `MAX_SUBSTEPS = 5` to prevent spiral of death (line 63)
- Accumulator pattern in animation loop (lines 986-1166)

**Player controller**:
- Capsule rigid body with locked rotations and CCD enabled (lines 423-436)
- Ground detection via raycasting with surface normal check (lines 859-873)
- Smooth velocity-based movement (lines 906-937)

**Dual environment representation**:
- Visual: Gaussian splat mesh from `.spz` file (lines 590-605)
- Physical: Collision trimesh from `.glb` file (same environment, invisible) (lines 537-588)
- Both use coordinate transformations (collision mesh: `scale.set(-1, -1, 1)`)
- Mesh rotation auto-detected based on URL source (marble.worldlabs.ai vs others) (lines 167-176)

**Dynamic objects**:
- Jenga tower: 48 dynamic box colliders (16 layers × 3 bricks), disabled by default (lines 350-420)
- Projectiles: Dynamic spheres with high restitution and CCD (lines 939-984)
- Dynamic models: Runtime-loaded GLB models with trimesh colliders (lines 614-751)

### Audio System

Web Audio API implementation with (lines 458-526):
- **Spatial audio**: Distance-based volume attenuation for bounce sounds (lines 490-522)
- **Velocity-based pitch modulation**: Faster collisions = higher pitch
- **Bounce detection**: Velocity change threshold triggers sound effects (line 1047)
- Audio context initialized on first user interaction (lines 463-488, 524-525)

### Dynamic Model Loading

Runtime model loading system via `loadDynamicModel()` (lines 614-751):
- **GLTFLoader** for `.glb` models
- Models spawn 3 units in front of camera
- Automatic material conversion via `setupMaterialsForLighting()` (lines 67-125)
- Shared rigid body with per-mesh trimesh colliders
- Scaled by `DYNAMIC_MODEL_SCALE = 0.5` (line 64)
- Models become grabbable objects
- Cross-origin loading handled via proxy API (`/api/whiteboard/model`)

### AI-Powered 3D Generation

Three content generation methods integrated with Meshy AI:

**1. Whiteboard Drawing** (lines 1650-1675):
- Press **L** to open whiteboard
- Draw on canvas and generate 3D models from drawings
- Shows generation progress with real-time updates

**2. Image-to-3D** (lines 1420-1526, 1678-1734):
- Press **U** to open upload modal
- Upload JPG/JPEG/PNG/WebP images
- Meshy AI converts images to textured 3D models
- Progress polling with visual feedback

**3. Text-to-3D** (lines 1247-1418, 1736-1832):
- Press **T** to open text modal
- Describe object in natural language (e.g., "a medieval sword with golden handle")
- Two-stage generation: preview mesh → textured refinement
- Art style selection (realistic/sculpture)
- Progress tracking for both stages (preview: 0-45%, refine: 50-100%)

All generated models are loaded dynamically via `__LOAD_DYNAMIC_MODEL__` (line 753)

### Inventory System

Basic inventory infrastructure (lines 15-17, 164, 194-198):
- `Inventory` component dynamically imported with `ssr: false`
- `InventoryItem` interface for preloaded models
- Empty array ready for model URLs to be added
- Press **I** to toggle inventory (keyboard shortcut implemented)
- `handleSelectItem` function spawns models from inventory into the scene
- Designed to be easily extensible for future generated models

### Configuration

All tuneable parameters in `CONFIG` object (lines 23-54):
- `GLOBAL_SCALE = 0.7` affects all physics/movement values (line 21)
- Physics constants: gravity, restitution, collider sizes (lines 24-31)
- Movement speeds: player, projectiles (lines 26-27)
- Audio settings: volumes, pitch ranges, distance attenuation (lines 32-33, 40-41)
- Environment paths: collision mesh (`.glb`) and splats (`.spz`) (lines 34-38)
- Jenga tower parameters: enabled (false by default), scale, dimensions (lines 42-48)
- Grab system settings: distances, highlight color (lines 49-53)
- Other constants: player dimensions (lines 56-58), jump speed (line 59), rotation speed (line 773)

### Controls & Interaction

**Movement & Camera** (lines 438-456, 776-838, 906-937):
- **PointerLockControls**: First-person camera control
- **WASD**: Horizontal movement
- **R/F**: Vertical movement (fly up/down)
- **Space**: Jump (when grounded)
- **Mouse**: Look around

**Interaction** (lines 840-857):
- **Click**: Shoot projectile / grab object / release grabbed object
- **Arrow Keys**: Rotate grabbed object (pitch/yaw) (lines 1086-1105)
- **Period (.)**: Launch grabbed object forward at high speed (lines 795-809)

**UI & Features**:
- **L**: Toggle whiteboard drawing interface
- **U**: Open image-to-3D upload modal
- **T**: Open text-to-3D generation modal
- **I**: Toggle inventory (not yet fully implemented)
- **Escape**: Close any open modal

**Debug** (lines 776-830):
- **M**: Toggle debug mode - shows collision mesh instead of splats (lines 779-782, 875-904)
- **P**: Print player position and camera orientation to console (lines 811-830)

**Grab system** (lines 759-773, 840-857, 1082-1131, 1168-1194):
- Raycaster-based object detection with max distance (line 1176)
- Hover feedback: Yellow emissive glow on grabbable objects (line 1192)
- Hold: Fixed distance from camera with zeroed velocity (lines 1113-1114)
- Rotation: Arrow keys rotate object in pitch/yaw, tracked cumulatively (lines 770-773, 1086-1127)
- Launch: Period key throws object forward (lines 795-809)

### Next.js Configuration

**Critical for Rapier physics** (see `next.config.ts`):
- `asyncWebAssembly: true` in webpack experiments
- COOP/COEP headers for `SharedArrayBuffer` support:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`

### TypeScript Path Aliases

- `@/*` maps to `./src/*`

### Asset Loading

**Static assets** from `/public` (lines 537-588, 590-605, 469):
- Environment collision mesh: `.glb` file (default: `test1.glb`)
- Gaussian splats: `.spz` file (default: `test1.spz`)
- Audio: `/bounce.mp3` for collision sounds

**Dynamic assets** via API:
- Models from URLs: Proxied through `/api/whiteboard/model` for CORS
- AI-generated models: Retrieved from Meshy AI endpoints
  - `/api/whiteboard/send` - Image-to-3D generation
  - `/api/whiteboard/text` - Text-to-3D generation
  - `/api/whiteboard/status` - Progress polling

## Key Implementation Details

### Coordinate System

**Environment** (lines 541-546, 603-605):
- Collision mesh: `scale.set(-1, -1, 1)` (mirrored) + rotation based on source (line 541)
- Splat mesh: `scale.set(SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE)` where SPLAT_SCALE = 3 (line 604)
- Rotation auto-detection (lines 167-176):
  - Marble.worldlabs.ai sources: `[0, 0, 0]` (no rotation)
  - Other sources: `[Math.PI/2, Math.PI, Math.PI]`

**Dynamic models** (lines 647-650, 695-700):
- Spawn position: 3 units in front of camera
- Scaled by `DYNAMIC_MODEL_SCALE = 0.5` (line 64)
- Per-mesh colliders use world-to-local coordinate transforms (lines 714-721)

### Rapier Initialization

- Race condition guard with 10s timeout (lines 295-307)
- Must complete before scene initialization proceeds
- Error handling for initialization failures

### Debug Mode

Toggle with **M** key (lines 779-782, 875-904):
- Replaces splat rendering with collision mesh using `MeshNormalMaterial`
- Shows the actual physics geometry used for collisions
- Original materials saved and restored on toggle (lines 532-536, 885-903)
- Environment visibility toggled (splats hidden, collision mesh shown)

### Physics Update Flow

Animation loop (lines 991-1166):

1. **Frame timing** (lines 995-996): Calculate delta time with max cap of 0.1s
2. **Update mesh rotation state** (lines 998-1012): Track environment rotation changes
3. **Update movement input** (line 1014): Process WASD/R/F key states
4. **Physics accumulator** (lines 1016-1134): Fixed timestep updates
   - Accumulate frame time
   - Step physics in fixed increments (up to MAX_SUBSTEPS)
   - Update projectile positions and detect bounces (lines 1030-1056)
   - Update Jenga block positions (lines 1058-1068)
   - Update dynamic model positions (lines 1070-1080)
   - Update grabbed object position/rotation (lines 1082-1131)
5. **Update camera position** (lines 1136-1156): Sync camera to player body
6. **Update player position state** (lines 1142-1147): Track player coordinates for HUD
7. **Render splats** (line 1158): Update Spark renderer
8. **Update hover state** (line 1159): Check raycaster for grabbable objects
9. **Update animation mixers** (lines 1161-1163): Update skeletal animations (if any)
10. **Render scene** (line 1165): Final Three.js render call

### Loading States & UI

**Loading screen** (lines 164-165, 533-600, 1533-1545):
- Shows during asset loading with progress messages
- Tracks collision mesh and splat loading separately
- Hides when splats finish loading (line 599)

**Generation progress** (lines 162-163, 1626-1645):
- Real-time progress bar for AI model generation
- Different stages for text-to-3D (preview 0-45%, refine 50-100%)
- Progress polling from API endpoints

**Modal system** (lines 158-161, 195-285):
- Whiteboard, upload, and text modals unlock pointer
- Escape key closes any open modal
- Pointer automatically re-locks after modal close
