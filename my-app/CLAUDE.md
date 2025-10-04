# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 15 application featuring an interactive 3D tavern scene that integrates **Gaussian Splats** (via Spark), **Rapier Physics**, and **Three.js** to create a first-person physics-based environment with animated characters and spatial audio.

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

The tavern scene **must be client-side only** due to Three.js and WASM dependencies:
- Uses `'use client'` directive
- Dynamic import with `ssr: false` in `/app/tavern/page.tsx`
- Client-side mounting guard pattern (see lines 196-198 in `TavernScene.tsx`)

### Physics System

**Fixed timestep physics loop** independent of render frame rate:
- `FIXED_TIME_STEP = 1/60` (60Hz physics)
- `MAX_SUBSTEPS = 5` to prevent spiral of death
- Accumulator pattern in animation loop (lines 752-832)

**Player controller**:
- Capsule rigid body with locked rotations and CCD enabled
- Ground detection via raycasting with surface normal check
- Wall-sliding implemented via velocity adjustment

**Dual environment representation**:
- Visual: Gaussian splat mesh from `.spz` file
- Physical: Collision trimesh from `.glb` file (same environment, invisible)
- Both use mirrored coordinate space

**Dynamic objects**:
- Jenga tower: 48 dynamic box colliders (16 layers × 3 bricks)
- Projectiles: Dynamic spheres with high restitution
- Character bone colliders: Kinematic position-based spheres

### Audio System

Web Audio API implementation with:
- **Spatial audio**: Distance-based volume attenuation, velocity-based pitch modulation
- **Character voices**: Cooldown-based voice lines triggered on projectile collision with bone colliders
- **Background music**: Looping audio with gain control
- Global mute system affecting all audio sources

### Character System

Two loader types:
- **GLTFLoader**: For `.glb` models (Orc)
- **FBXLoader**: For `.fbx` models (Bartender)

Both receive:
- `setupMaterialsForLighting()`: Converts `MeshBasicMaterial` → `MeshStandardMaterial`
- `AnimationMixer` for skeletal animation
- `createBoneColliders()`: Kinematic spheres attached to bones for hit detection

### Configuration

All tuneable parameters in `CONFIG` object (lines 13-75):
- `GLOBAL_SCALE = 0.7` affects all physics/movement values
- Physics constants (gravity, restitution, collider sizes)
- Movement speeds (player, projectiles)
- Audio settings (volumes, cooldowns, pitch ranges)
- Asset paths (environment, characters, audio files)
- Jenga tower parameters (enabled, scale, dimensions)
- Grab system settings (distances, highlight color)

### Controls & Interaction

- **PointerLockControls**: First-person camera control
- **WASD**: Movement, **R/F**: Vertical, **Space**: Jump
- **Click**: Shoot projectile / grab-release object
- **M**: Debug mode (shows collision mesh + bone colliders)
- **P**: Print player position/orientation to console

**Grab system**:
- Raycaster-based object detection (`CONFIG.GRAB.MAX_DISTANCE`)
- Hover feedback: Emissive glow on grabbable objects
- Hold: Fixed distance from camera with zeroed velocity and yaw-aligned rotation

### Next.js Configuration

**Critical for Rapier physics** (see `next.config.ts`):
- `asyncWebAssembly: true` in webpack experiments
- COOP/COEP headers for `SharedArrayBuffer` support:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`

### TypeScript Path Aliases

- `@/*` maps to `./src/*`

### Asset Loading

Assets loaded from `/public`:
- Environment: `.glb` collision mesh + `.spz` splat file
- Characters: `.glb` or `.fbx` models
- Audio: `.mp3` files (bounce, voices, background music)

## Key Implementation Details

### Coordinate System

- Environment collision mesh: `scale.set(-1, -1, 1)` (mirrored)
- Splat mesh: `scale.set(SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE)`
- Character positions/rotations configured per-character in `CONFIG.CHARACTERS`

### Rapier Initialization

- Race condition guard with 10s timeout (line 208-212)
- Must complete before scene initialization proceeds

### Debug Mode

Toggle with **M** key to:
- Replace splat rendering with collision mesh (`MeshNormalMaterial`)
- Visualize bone colliders as colored wireframe spheres (magenta: Orc, cyan: Bartender)

### Physics Update Flow

1. Accumulate frame time
2. Step physics in fixed increments (up to MAX_SUBSTEPS)
3. Update projectile/Jenga positions from physics
4. Handle projectile collisions (bounce sounds, character voice triggers)
5. Update player camera position
6. Update character bone collider positions
7. Update animation mixers
