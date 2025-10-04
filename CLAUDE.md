# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive 3D tavern demo that integrates **Spark** (Gaussian Splats), **Rapier Physics**, and **Three.js** to create a first-person physics-based environment with animated characters and spatial audio.

## Development Commands

```bash
# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Architecture

### Core Integration

The application demonstrates a unique integration of three rendering/simulation systems:

1. **Spark (Gaussian Splats)**: Renders photorealistic environment using `.spz` splat files via `SparkRenderer`
2. **Rapier Physics**: Provides realistic collision detection using mesh colliders from `.glb` files
3. **Three.js**: Manages 3D scene, camera, lighting, and character rendering

**Key architectural pattern**: The environment exists as **dual representations**:
- Visual: Gaussian splat mesh (photorealistic rendering)
- Physical: Collision mesh (invisible trimesh collider from GLB)

Both share the same coordinate space with mirrored scale factors (`-1, -1, 1` for collision mesh, `SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE` for splats).

### Physics System

- **Fixed timestep**: Physics runs at 60Hz independent of render framerate using accumulator pattern (`FIXED_TIME_STEP = 1/60`, `MAX_SUBSTEPS = 5`)
- **Player controller**: Capsule-based rigid body with locked rotations, CCD enabled, and ground detection via raycasting
- **Bone colliders**: Kinematic position-based spheres attached to character skeleton bones for hit detection
- **Dynamic objects**: Projectiles (spheres) and Jenga tower (boxes) with proper restitution/friction

### Audio System

Web Audio API implementation with:
- **Spatial audio**: Distance-based volume attenuation and velocity-based pitch modulation
- **Character voices**: Cooldown-based random voice line selection on projectile hits
- **Background music**: Looping music with dynamic gain control
- Global mute system (`window.__MUTED__`) that scales all audio output

### Character System

Two character types with different loaders:
- **GLTFLoader**: For `.glb` models (e.g., Orc)
- **FBXLoader**: For `.fbx` models (e.g., Bartender)

Both receive:
- Material conversion (`setupMaterialsForLighting`): Converts MeshBasicMaterial → MeshStandardMaterial
- Animation mixers for skeletal animation playback
- Bone-level collision spheres (`createBoneColliders`)

### Controls

- **PointerLockControls**: First-person camera with mouse look
- **WASD**: Horizontal movement with wall-sliding collision response (`adjustVelocityForWalls`)
- **R/F**: Vertical flying
- **Space**: Jump (only when grounded)
- **Click**: Shoot projectiles or grab/release objects
- **M**: Toggle debug mode (switches between splat rendering and collision mesh visualization)
- **P**: Print player position and orientation to console

### Grab System

Raycaster-based object interaction:
- **Hover detection**: Uses `THREE.Raycaster` against `grabbableMeshes` array
- **Highlight**: Applies emissive glow to hovered objects
- **Hold mechanic**: Grabbed objects maintain fixed distance from camera with velocity zeroed and canonical yaw-aligned rotation

## Configuration

All tuneable parameters live in the `CONFIG` object at the top of `src/main.js`:
- Physics constants (gravity, restitution, collider sizes)
- Movement speeds (player, projectiles)
- Audio settings (volumes, cooldowns, pitch ranges)
- Asset paths (splats, meshes, sounds)
- Jenga tower parameters (enabled, scale, dimensions)
- Grab system distances and visual feedback

## Asset Pipeline

Assets are loaded from `/public` directory:
- **Environment**: Collision mesh (`.glb`) + splat file (`.spz`)
- **Characters**: Animated models (`.glb` or `.fbx`)
- **Audio**: MP3 files for bounce sounds, character voices, background music

## Deployment

Configured for Netlify deployment (see `netlify.toml` and `DEPLOYMENT.md`):
- Build command: `npm run build`
- Publish directory: `dist`
- Special headers required: COOP/COEP for SharedArrayBuffer support (Rapier requirement)
- WASM MIME types configured

## Important Technical Details

### Vite Configuration

- **Server headers**: COOP/COEP headers required for Rapier's SharedArrayBuffer usage
- **Build target**: `esnext` for modern JS features
- **Manual chunks**: Separates `rapier` and `three` for optimal loading
- **optimizeDeps.exclude**: `@dimforge/rapier3d-compat` must be excluded to prevent bundler issues

### Coordinate Systems

- Environment mesh uses mirrored scale (`-1, -1, 1`) applied via `environment.scale.set()`
- Splat mesh uses `(SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE)` for visual alignment
- Character positions and rotations configured per-character in `CONFIG.CHARACTERS`

### Debug Mode (M key)

When enabled:
- Swaps splat mesh for collision mesh with `MeshNormalMaterial`
- Visualizes bone colliders as colored wireframe spheres (magenta for Orc, cyan for Bartender)
- Useful for debugging physics interactions and collision geometry
