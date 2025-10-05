# Walking Sound System

## Overview

Walking sounds are now implemented for each world! The system automatically plays a looping walking sound when the player moves on the ground and stops when the player stops or is in the air.

## How It Works

### 1. **Automatic Detection**

- ✅ Detects when player is moving (WASD keys pressed)
- ✅ Detects when player is grounded (not jumping/flying)
- ✅ Only plays sound when BOTH conditions are true
- ✅ Automatically loops while walking
- ✅ Stops immediately when player stops or jumps

### 2. **Volume**

- Walking sound plays at 40% volume (0.4 gain)
- Background music plays at 30% volume (0.3 gain)
- Sound effects play at variable volumes based on distance

## Adding Walking Sounds to Worlds

### For Preset Worlds

Edit `src/data/preset-worlds.json`:

```json
{
  "id": "1f8d7af4-abd5-4272-9682-8e188e3f844c",
  "name": "Fantasy Village in the Forest",
  "thumbnailUrl": "...",
  "splatUrl": "...",
  "meshUrl": "...",
  "backgroundMusic": "/fantasy_village.mp3",
  "walkingSound": "/walking/grass.mp3", // ← Add this line
  "isPreset": true
}
```

### For Generated Worlds

Walking sounds can be added to the job JSON file:

```json
{
  "id": "...",
  "prompt": "A futuristic city",
  "status": "SUCCEEDED",
  "output": { ... },
  "backgroundMusic": "/song.mp3",
  "walkingSound": "/walking/concrete.mp3"  // ← Add this line
}
```

## Recommended Sound Files

Create a `/public/walking/` directory and add these types of sounds:

### Surface Types

- `grass.mp3` - For natural outdoor areas
- `concrete.mp3` - For urban/modern settings
- `wood.mp3` - For wooden floors/bridges
- `stone.mp3` - For dungeons/castles
- `snow.mp3` - For winter/snowy areas
- `sand.mp3` - For beaches/deserts
- `water.mp3` - For shallow water/wet surfaces
- `metal.mp3` - For industrial/sci-fi areas

### Sound Requirements

- **Format**: MP3 (recommended)
- **Length**: 1-3 seconds (will loop seamlessly)
- **Quality**: 128-192kbps
- **Loop**: Should loop seamlessly (start and end match)

## Example: Complete World Configuration

```json
{
  "id": "fantasy-forest",
  "name": "Enchanted Forest",
  "thumbnailUrl": "/thumbnails/forest.jpg",
  "splatUrl": "/splats/forest.ply",
  "meshUrl": "/meshes/forest.glb",
  "backgroundMusic": "/music/forest-ambience.mp3",
  "walkingSound": "/walking/grass.mp3",
  "isPreset": true
}
```

## Quick Setup Example

1. **Download or create walking sound effects**

   ```bash
   # Create the directory
   mkdir -p public/walking

   # Add your sound files
   cp path/to/grass.mp3 public/walking/
   cp path/to/stone.mp3 public/walking/
   ```

2. **Update preset-worlds.json**

   ```json
   [
     {
       "id": "1f8d7af4-abd5-4272-9682-8e188e3f844c",
       "name": "Fantasy Village in the Forest",
       ...
       "backgroundMusic": "/fantasy_village.mp3",
       "walkingSound": "/walking/grass.mp3"
     }
   ]
   ```

3. **Test it out**
   - Load the world
   - Press WASD to walk
   - Hear the footsteps!
   - Jump (Space) - sound stops
   - Land and walk - sound resumes

## Technical Details

### Audio Implementation

- Uses Web Audio API `AudioBufferSourceNode`
- Looping enabled for seamless playback
- Managed lifecycle (starts/stops automatically)
- Properly cleaned up on scene unmount

### Performance

- Sound file loaded once at initialization
- Minimal CPU overhead
- No memory leaks (proper cleanup)
- Works alongside background music and sound effects

## Troubleshooting

### Sound not playing?

1. ✅ Check browser console for audio loading errors
2. ✅ Verify file path is correct (relative to `/public/`)
3. ✅ Make sure file exists and is accessible
4. ✅ Try a different audio format (MP3 recommended)
5. ✅ Check that audio autoplay is allowed in browser

### Sound cuts out?

- Make sure the sound file loops seamlessly
- Use audio editing software to create a perfect loop
- Test the file independently before adding to game

### Volume too loud/quiet?

- Edit line 718 in `Scene.tsx`: `gainNode.gain.value = 0.4;`
- Adjust the value (0.0 = silent, 1.0 = full volume)
- Recommended: 0.3 - 0.5

## Files Modified

- ✅ `src/components/Scene.tsx` - Core implementation
- ✅ `src/app/world/[id]/page.tsx` - World page component
- ✅ `src/app/api/world/[id]/route.ts` - API endpoint
- ✅ `src/data/preset-worlds.json` - Add walkingSound to each world

## Next Steps

1. Add walking sound files to `/public/walking/`
2. Update `preset-worlds.json` with walking sound paths
3. Test each world to ensure sounds are appropriate
4. Enjoy immersive footsteps! 👣
