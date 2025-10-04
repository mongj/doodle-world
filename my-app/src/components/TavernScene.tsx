'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const Whiteboard = dynamic(() => import('./Whiteboard'), { ssr: false });

const GLOBAL_SCALE = 0.7;

const CONFIG = {
  GRAVITY: { x: 0, y: -9.81 * GLOBAL_SCALE, z: 0 },
  RAPIER_INIT_TIMEOUT: 10000,
  MOVE_SPEED: 3 * GLOBAL_SCALE,
  PROJECTILE_SPEED: 15 * GLOBAL_SCALE,
  VOICE_COOLDOWN: 1.0,
  MUSIC_VOLUME: 0.15,
  VOICE_VOLUME: 0.4,
  PROJECTILE_RADIUS: 0.2 * GLOBAL_SCALE,
  PROJECTILE_RESTITUTION: 0.9,
  ENVIRONMENT_RESTITUTION: 0.0,
  BONE_COLLIDER_RADIUS: 0.3,
  BOUNCE_DETECTION_THRESHOLD: 2.0,
  CHARACTER_HIT_DISTANCE: 0.8,
  VELOCITY_PITCH_RANGE: { min: 0.9, max: 1.1 },
  VOLUME_DISTANCE_MAX: 10,
  ENVIRONMENT: {
    MESH: 'test.glb',
    SPLATS: 'test.spz',
    SPLAT_SCALE: 3,
    MESH_ROTATION: [Math.PI / 2, Math.PI , Math.PI],
  },
  CHARACTERS: {
    ORC: {
      MODEL: 'orc.glb',
      POSITION: [-2, -0.8, 0],
      ROTATION: Math.PI / 2,
      SCALE: [1, 1, 1],
    },
    BARTENDER: {
      MODEL: 'Bartending.fbx',
      POSITION: [3.0, -0.7, 2],
      ROTATION: -Math.PI / 2,
      SCALE: [0.007, 0.007, 0.007],
    },
  },
  AUDIO_FILES: {
    BOUNCE: 'bounce.mp3',
    BACKGROUND_MUSIC: 'kitchen_music.mp3',
    ORC_VOICES: [
      'lines/rocks.mp3',
      'lines/mushroom.mp3',
      'lines/watch.mp3',
      'lines/vex.mp3',
    ],
    BARTENDER_VOICES: [
      'lines/working.mp3',
      'lines/juggler.mp3',
      'lines/drink.mp3',
    ],
  },
  JENGA: {
    ENABLED: true,
    SCALE: 0.2,
    LAYERS: 16,
    BRICK: { LEN: 3.0, WID: 1.0, HT: 0.6, GAP: 0.001 },
    ORIGIN: { x: -0.896, y: -0.063 - 0.7 + 0.001, z: 6.385 },
  },
  GRAB: {
    MAX_DISTANCE: 3.0,
    HOLD_DISTANCE: 1.2,
    HIGHLIGHT_EMISSIVE: 0xffff00,
  },
};

const PLAYER_RADIUS = 0.1 * GLOBAL_SCALE;
const PLAYER_HALF_HEIGHT = 0.5 * GLOBAL_SCALE;
const PLAYER_EYE_HEIGHT = 1.0 * GLOBAL_SCALE;
const PLAYER_JUMP_SPEED = 8.0 * GLOBAL_SCALE;
const PROJECTILE_SPAWN_OFFSET = PLAYER_RADIUS + CONFIG.PROJECTILE_RADIUS + 0.15 * GLOBAL_SCALE;
const FIXED_TIME_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;

// Utility functions
function setupMaterialsForLighting(object: THREE.Object3D, brightnessMultiplier = 1.0) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const newMaterials: THREE.Material[] = [];

      for (const material of materials) {
        if ('emissive' in material) {
          (material as any).emissive.setHex(0x000000);
        }
        if ('emissiveIntensity' in material) {
          (material as any).emissiveIntensity = 0;
        }

        if (material.type === 'MeshBasicMaterial') {
          const basicMat = material as THREE.MeshBasicMaterial;
          const newMaterial = new THREE.MeshStandardMaterial({
            color: basicMat.color,
            map: basicMat.map,
            roughness: 0.8,
            metalness: 0.1,
          });
          newMaterials.push(newMaterial);
        } else {
          if ('roughness' in material) (material as any).roughness = 0.8;
          if ('metalness' in material) (material as any).metalness = 0.1;
          if ('color' in material && brightnessMultiplier !== 1.0) {
            const currentColor = (material as any).color.clone();
            currentColor.multiplyScalar(brightnessMultiplier);
            (material as any).color = currentColor;
          }
          if ('transparent' in material && 'opacity' in material) {
            if ((material as any).transparent && (material as any).opacity === 1) {
              (material as any).transparent = false;
            }
          }
          newMaterials.push(material);
        }
      }

      mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
    }
  });
}

function createBoneColliders(character: THREE.Object3D, world: RAPIER.World) {
  const boneColliders: Array<{ bone: THREE.Bone; body: RAPIER.RigidBody }> = [];
  character.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      const bone = child as THREE.Bone;
      const bonePos = new THREE.Vector3();
      bone.getWorldPosition(bonePos);

      const colliderDesc = RAPIER.ColliderDesc.ball(CONFIG.BONE_COLLIDER_RADIUS);
      const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        bonePos.x,
        bonePos.y,
        bonePos.z
      );

      const body = world.createRigidBody(bodyDesc);
      world.createCollider(colliderDesc, body);
      boneColliders.push({ bone, body });
    }
  });
  return boneColliders;
}

async function loadAudioFiles(audioContext: AudioContext, fileList: string[]) {
  try {
    const buffers = await Promise.all(
      fileList.map((file) =>
        fetch(file)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      )
    );
    return buffers;
  } catch (error) {
    console.error('Error loading audio files:', error);
    return [];
  }
}

function playAudio(audioContext: AudioContext | null, buffer: AudioBuffer | null, volume = 1.0, playbackRate = 1.0, muted: boolean) {
  if (!audioContext || !buffer) return;

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  source.buffer = buffer;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  gainNode.gain.value = (muted ? 0 : 1) * volume;
  source.playbackRate.value = playbackRate;
  source.start(0);

  return source;
}

export default function TavernScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const startButtonRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const gameStartedRef = useRef(false);
  const [showUI, setShowUI] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [meshRotationState, setMeshRotationState] = useState({
    x: CONFIG.ENVIRONMENT.MESH_ROTATION[0],
    y: CONFIG.ENVIRONMENT.MESH_ROTATION[1],
    z: CONFIG.ENVIRONMENT.MESH_ROTATION[2],
  });

  const formatRotation = (radians: number) =>
    `${THREE.MathUtils.radToDeg(radians).toFixed(1)}° (${radians.toFixed(2)} rad)`;

  useEffect(() => {
    setShowUI(true);
  }, []);

  useEffect(() => {
    const handleWhiteboardShortcut = (e: KeyboardEvent) => {
      if (e.code === 'KeyL') {
        const newState = !showWhiteboard;
        setShowWhiteboard(newState);

        // Unlock pointer when opening whiteboard, lock when closing
        if (controlsRef.current) {
          if (newState) {
            controlsRef.current.unlock();
          } else {
            // Re-lock pointer when closing whiteboard
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }
        }
      } else if (e.code === 'Escape' && showWhiteboard) {
        setShowWhiteboard(false);
        // Re-lock pointer after closing with ESC
        setTimeout(() => {
          if (controlsRef.current) {
            controlsRef.current.lock();
          }
        }, 100);
      }
    };

    window.addEventListener('keydown', handleWhiteboardShortcut);
    return () => window.removeEventListener('keydown', handleWhiteboardShortcut);
  }, [showWhiteboard]);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;
    const container = containerRef.current;

    async function initScene() {
      try {
        const initPromise = RAPIER.init();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Rapier initialization timeout')), CONFIG.RAPIER_INIT_TIMEOUT)
        );
        await Promise.race([initPromise, timeoutPromise]);
        console.log('✓ Rapier physics initialized');
      } catch (error) {
        console.error('Failed to initialize Rapier:', error);
        return;
      }

      if (!mounted) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x202020);

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.rotation.y = Math.PI;

      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const sparkRenderer = new SparkRenderer({ renderer });
      if (sparkRenderer.defaultView) {
        sparkRenderer.defaultView.sort32 = true;
        sparkRenderer.defaultView.sortRadial = true;
      }
      camera.add(sparkRenderer);
      container.appendChild(renderer.domElement);

      // Lighting
      const hemiLight = new THREE.HemisphereLight(0xfff4e6, 0x2a1a0a, 1.0);
      hemiLight.position.set(0, 20, 0);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffe6cc, 0.3);
      dirLight.position.set(3, 10, -5);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0xffa500, 2.0, 10);
      pointLight.position.set(-3.2, -1, 4.5);
      scene.add(pointLight);

      const world = new RAPIER.World(CONFIG.GRAVITY);

      // Jenga tower
      const jengaBlocks: Array<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }> = [];
      const bodyToMesh = new Map<number, THREE.Mesh>();
      const projectileBodies = new Set<number>();
      const meshToBody = new Map<THREE.Mesh, RAPIER.RigidBody>();
      const grabbableMeshes: THREE.Mesh[] = [];

      function buildJengaTower(world: RAPIER.World, scene: THREE.Scene, cfg: typeof CONFIG.JENGA) {
        const scale = cfg.SCALE;
        const brickLen = cfg.BRICK.LEN * scale;
        const brickWid = cfg.BRICK.WID * scale;
        const brickHt = cfg.BRICK.HT * scale;
        const gap = cfg.BRICK.GAP * scale;
        const base = cfg.ORIGIN;

        for (let layer = 0; layer < cfg.LAYERS; layer++) {
          const alongZ = layer % 2 === 0;
          const sizeX = alongZ ? brickWid : brickLen;
          const sizeZ = alongZ ? brickLen : brickWid;
          const halfX = sizeX / 2;
          const halfY = brickHt / 2;
          const halfZ = sizeZ / 2;
          const y = base.y + halfY + layer * (brickHt + gap);

          const pitch = (alongZ ? sizeX : sizeZ) + gap;
          for (let i = -1; i <= 1; i += 1) {
            const offset = i * pitch;
            const x = alongZ ? base.x + offset : base.x;
            const z = alongZ ? base.z : base.z + offset;

            const geom = new THREE.BoxGeometry(sizeX, brickHt, sizeZ);
            const mat = new THREE.MeshStandardMaterial({
              color: 0x0f0fff,
              metalness: 0.1,
              roughness: 0.8,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.set(x, y, z);
            scene.add(mesh);

            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(x, y, z)
              .setCanSleep(true)
              .setLinearDamping(0.1)
              .setAngularDamping(0.2);
            const body = world.createRigidBody(bodyDesc);
            const collider = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
              .setFriction(0.8)
              .setRestitution(0.05);
            world.createCollider(collider, body);

            jengaBlocks.push({ mesh, body });
            bodyToMesh.set(body.handle, mesh);
            meshToBody.set(mesh, body);
            grabbableMeshes.push(mesh);
          }
        }
      }

      if (CONFIG.JENGA.ENABLED) {
        buildJengaTower(world, scene, CONFIG.JENGA);
      }

      // Player
      const playerBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 1.2, 0)
          .lockRotations(true)
          .setLinearDamping(4.0)
          .setCcdEnabled(true)
      );
      const colliderDesc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
        .setFriction(0.8)
        .setRestitution(0.0);
      world.createCollider(colliderDesc, playerBody);

      const controls = new PointerLockControls(camera, renderer.domElement);
      controlsRef.current = controls;
      (window as any).__TAVERN_CONTROLS__ = controls;

      controls.addEventListener('lock', () => {
        gameStartedRef.current = true;
        if (reticleRef.current) reticleRef.current.style.display = 'block';
        if (startButtonRef.current) startButtonRef.current.style.display = 'none';
      });
      controls.addEventListener('unlock', () => {
        if (reticleRef.current) reticleRef.current.style.display = 'none';
        // Only show start button if game hasn't started yet (not when whiteboard opens)
        if (startButtonRef.current && !gameStartedRef.current) {
          startButtonRef.current.style.display = 'flex';
        }
      });

      // Audio system
      let audioContext: AudioContext | null = null;
      const audioBuffers: Record<string, AudioBuffer | AudioBuffer[]> = {};
      const voiceCooldowns: Record<string, number> = { orc: 0, bartender: 0 };
      let musicGain: GainNode | null = null;
      let muted = false;

      function initAudio() {
        if (audioContext) return;
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        Promise.all([
          fetch(CONFIG.AUDIO_FILES.BOUNCE)
            .then((response) => response.arrayBuffer())
            .then((buffer) => audioContext!.decodeAudioData(buffer))
            .then((buffer) => {
              audioBuffers.bounce = buffer;
              return buffer;
            }),
          loadAudioFiles(audioContext, CONFIG.AUDIO_FILES.ORC_VOICES).then((buffers) => {
            audioBuffers.orcVoices = buffers;
            return buffers;
          }),
          loadAudioFiles(audioContext, CONFIG.AUDIO_FILES.BARTENDER_VOICES).then((buffers) => {
            audioBuffers.bartenderVoices = buffers;
            return buffers;
          }),
          fetch(CONFIG.AUDIO_FILES.BACKGROUND_MUSIC)
            .then((response) => response.arrayBuffer())
            .then((buffer) => audioContext!.decodeAudioData(buffer))
            .then((buffer) => {
              audioBuffers.backgroundMusic = buffer;
              startBackgroundMusic();
            }),
        ])
          .then(() => console.log('✓ Audio system initialized'))
          .catch((error) => console.error('Audio loading error:', error));
      }

      function startBackgroundMusic() {
        if (!audioContext || !audioBuffers.backgroundMusic) return;

        function playMusic() {
          const source = audioContext!.createBufferSource();
          source.buffer = audioBuffers.backgroundMusic as AudioBuffer;
          musicGain = audioContext!.createGain();
          source.connect(musicGain);
          musicGain.connect(audioContext!.destination);
          musicGain.gain.value = muted ? 0 : CONFIG.MUSIC_VOLUME;
          source.start(0);
          source.onended = playMusic;
        }
        playMusic();
      }

      function playVoiceLine(character: string) {
        const cooldownKey = character;
        if (voiceCooldowns[cooldownKey] > 0) return;

        const voiceBuffers = audioBuffers[`${character}Voices`];
        if (!voiceBuffers || voiceBuffers.length === 0) return;

        const randomBuffer = voiceBuffers[Math.floor(Math.random() * voiceBuffers.length)];
        playAudio(audioContext, randomBuffer, CONFIG.VOICE_VOLUME, 1.0, muted);
        voiceCooldowns[cooldownKey] = CONFIG.VOICE_COOLDOWN;
        console.log(`${character} speaks`);
      }

      function playBounceSound(position: THREE.Vector3, velocity: THREE.Vector3) {
        if (!audioBuffers.bounce) return;

        const distance = camera.position.distanceTo(position);
        let volume = Math.max(0.1, 1.0 * (1 - distance / CONFIG.VOLUME_DISTANCE_MAX));

        let pitch = 1.0;
        if (velocity) {
          const speed = velocity.length();
          const normalizedSpeed = Math.min(speed / 20, 1.0);
          volume *= 0.3 + normalizedSpeed * 0.7;
          pitch = CONFIG.VELOCITY_PITCH_RANGE.min + normalizedSpeed * (CONFIG.VELOCITY_PITCH_RANGE.max - CONFIG.VELOCITY_PITCH_RANGE.min);
          pitch *= 0.97 + Math.random() * 0.06;
        }

        playAudio(audioContext, audioBuffers.bounce, volume, pitch, muted);
      }

      document.addEventListener('click', initAudio, { once: true });
      document.addEventListener('keydown', initAudio, { once: true });

      // Environment
      let environment: THREE.Group | null = null;
      let splatMesh: any = null;
      let splatsLoaded = false;
      const envDebugMaterial = new THREE.MeshNormalMaterial();
      const originalEnvMaterials = new Map<string, THREE.Material | THREE.Material[]>();

      const gltfLoader = new GLTFLoader();
      gltfLoader.load(CONFIG.ENVIRONMENT.MESH, (gltf) => {
        environment = gltf.scene;
        environment.scale.set(-1, -1, 1);
        environment.rotation.set(
          CONFIG.ENVIRONMENT.MESH_ROTATION[0],
          CONFIG.ENVIRONMENT.MESH_ROTATION[1],
          CONFIG.ENVIRONMENT.MESH_ROTATION[2]
        );
        setMeshRotationState({
          x: environment.rotation.x,
          y: environment.rotation.y,
          z: environment.rotation.z,
        });
        environment.updateMatrixWorld(true);
        scene.add(environment);

        environment.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const geometry = mesh.geometry.clone();
            mesh.updateWorldMatrix(true, false);
            geometry.applyMatrix4(mesh.matrixWorld);

            const vertices = new Float32Array(geometry.attributes.position.array);
            let indices: Uint32Array;

            if (geometry.index) {
              indices = new Uint32Array(geometry.index.array);
            } else {
              const count = geometry.attributes.position.count;
              indices = new Uint32Array(count);
              for (let i = 0; i < count; i++) indices[i] = i;
            }

            const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices).setRestitution(CONFIG.ENVIRONMENT_RESTITUTION);
            const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
            world.createCollider(colliderDesc, body);
          }
        });

        console.log('✓ Environment collision mesh loaded');
      });

      splatMesh = new SplatMesh({
        url: CONFIG.ENVIRONMENT.SPLATS,
        onLoad: () => {
          console.log(`✓ Gaussian splats loaded (${splatMesh.numSplats} splats)`);
          splatsLoaded = true;
          if (environment) environment.visible = false;
          scene.add(splatMesh);
        },
      });

      const { SPLAT_SCALE } = CONFIG.ENVIRONMENT;
      splatMesh.scale.set(SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE);
      splatMesh.position.set(0, 0, 0);

      // Characters
      const characters: Record<string, THREE.Object3D> = {};
      const animationMixers: Record<string, THREE.AnimationMixer> = {};
      const boneColliders: Record<string, Array<{ bone: THREE.Bone; body: RAPIER.RigidBody }>> = {};

      gltfLoader.load(CONFIG.CHARACTERS.ORC.MODEL, (gltf) => {
        const orc = gltf.scene;
        const config = CONFIG.CHARACTERS.ORC;
        orc.rotation.y = config.ROTATION;
        orc.scale.set(config.SCALE[0], config.SCALE[1], config.SCALE[2]);
        orc.position.set(config.POSITION[0], config.POSITION[1], config.POSITION[2]);
        scene.add(orc);
        setupMaterialsForLighting(orc);

        if (gltf.animations && gltf.animations.length > 0) {
          animationMixers.orc = new THREE.AnimationMixer(orc);
          for (const clip of gltf.animations) {
            animationMixers.orc.clipAction(clip).play();
          }
        }

        boneColliders.orc = createBoneColliders(orc, world);
        characters.orc = orc;
        console.log('✓ Orc character loaded');
      });

      const fbxLoader = new FBXLoader();
      fbxLoader.load(CONFIG.CHARACTERS.BARTENDER.MODEL, (fbx) => {
        const bartender = fbx;
        const config = CONFIG.CHARACTERS.BARTENDER;
        bartender.scale.set(config.SCALE[0], config.SCALE[1], config.SCALE[2]);
        bartender.position.set(config.POSITION[0], config.POSITION[1], config.POSITION[2]);
        bartender.rotation.y = config.ROTATION;
        scene.add(bartender);
        setupMaterialsForLighting(bartender, 2.0);

        if (fbx.animations && fbx.animations.length > 0) {
          animationMixers.bartender = new THREE.AnimationMixer(bartender);
          for (const clip of fbx.animations) {
            animationMixers.bartender.clipAction(clip).play();
          }
        }

        boneColliders.bartender = createBoneColliders(bartender, world);
        characters.bartender = bartender;
        console.log('✓ Bartender character loaded');
      });

      // Input handling
      const keyState: Record<string, boolean> = {};
      let debugMode = false;
      const debugVisuals: Record<string, Array<{ sphere: THREE.Mesh; bone: THREE.Bone }>> = { orc: [], bartender: [] };

      let hover: { body: RAPIER.RigidBody | null; mesh: THREE.Mesh | null; savedEmissive: number | null } = {
        body: null,
        mesh: null,
        savedEmissive: null,
      };
      let grabbed: { body: RAPIER.RigidBody | null; mesh: THREE.Mesh | null } = { body: null, mesh: null };

      const handleKeyDown = (e: KeyboardEvent) => {
        keyState[e.code] = true;

        if (e.code === 'KeyM') {
          debugMode = !debugMode;
          toggleDebugMode();
        }

        if (e.code === 'Space' && playerBody) {
          if (isPlayerGrounded()) {
            const v = playerBody.linvel();
            playerBody.setLinvel({ x: v.x, y: PLAYER_JUMP_SPEED, z: v.z }, true);
          }
        }

        if (e.code === 'KeyP') {
          if (playerBody) {
            const p = playerBody.translation();
            const posStr = `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.normalize();
            const yaw = (Math.atan2(forward.x, forward.z) * 180) / Math.PI;
            const pitch = (Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)) * 180) / Math.PI;
            console.log(`[Player] ${posStr}  yaw=${yaw.toFixed(1)}°  pitch=${pitch.toFixed(1)}°`);
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        keyState[e.code] = false;
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      renderer.domElement.addEventListener('click', () => {
        if (!controls.isLocked) return;
        if (grabbed.body) {
          grabbed = { body: null, mesh: null };
          return;
        }
        if (hover.body && hover.mesh) {
          grabbed = { body: hover.body, mesh: hover.mesh };
          return;
        }
        shootProjectile();
      });

      function isPlayerGrounded() {
        if (!playerBody) return false;
        const p = playerBody.translation();
        const origin = { x: p.x, y: p.y, z: p.z };
        const dir = { x: 0, y: -1, z: 0 };
        const ray = new RAPIER.Ray(origin, dir);
        const footOffset = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
        const hit = world.castRayAndGetNormal(ray, footOffset + 0.6, true);
        if (!hit) return false;
        const normalY = hit.normal ? hit.normal.y : 1.0;
        const nearGround = hit.timeOfImpact <= footOffset + 0.12 && normalY > 0.3;
        const vy = playerBody.linvel().y;
        return nearGround && vy <= 0.6;
      }

      function toggleDebugMode() {
        if (!environment || !splatMesh || !splatsLoaded) return;

        if (debugMode) {
          environment.visible = true;
          scene.remove(splatMesh);

          environment.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (!originalEnvMaterials.has(mesh.uuid)) {
                originalEnvMaterials.set(mesh.uuid, mesh.material);
              }
              mesh.material = envDebugMaterial;
            }
          });

          const characterNames = ['orc', 'bartender'];
          for (let index = 0; index < characterNames.length; index++) {
            const character = characterNames[index];
            if (boneColliders[character] && debugVisuals[character].length === 0) {
              const color = index === 0 ? 0xff00ff : 0x00ffff;
              for (const { bone } of boneColliders[character]) {
                const pos = new THREE.Vector3();
                bone.getWorldPosition(pos);

                const sphere = new THREE.Mesh(
                  new THREE.SphereGeometry(CONFIG.BONE_COLLIDER_RADIUS, 16, 16),
                  new THREE.MeshBasicMaterial({ color, wireframe: true })
                );
                sphere.position.copy(pos);
                scene.add(sphere);
                debugVisuals[character].push({ sphere, bone });
              }
            }
          }
        } else {
          environment.visible = false;
          scene.add(splatMesh);

          environment.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (originalEnvMaterials.has(mesh.uuid)) {
                mesh.material = originalEnvMaterials.get(mesh.uuid)!;
              }
            }
          });

          for (const character of ['orc', 'bartender']) {
            for (const { sphere } of debugVisuals[character]) {
              scene.remove(sphere);
            }
            debugVisuals[character] = [];
          }
        }
      }

      function updateMovement() {
        if (!controls.isLocked || !playerBody) return;

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        const moveDir = new THREE.Vector3();
        if (keyState.KeyW) moveDir.add(forward);
        if (keyState.KeyS) moveDir.sub(forward);
        if (keyState.KeyD) moveDir.add(right);
        if (keyState.KeyA) moveDir.sub(right);

        let targetX = 0;
        let targetZ = 0;
        if (moveDir.lengthSq() > 0) {
          moveDir.normalize().multiplyScalar(CONFIG.MOVE_SPEED);
          targetX = moveDir.x;
          targetZ = moveDir.z;
        }

        const current = playerBody.linvel();
        let targetY = current.y;
        if (keyState.KeyR) targetY += CONFIG.MOVE_SPEED;
        if (keyState.KeyF) targetY -= CONFIG.MOVE_SPEED;

        playerBody.setLinvel({ x: targetX, y: targetY, z: targetZ }, true);
      }

      // Projectiles
      const projectiles: Array<{ mesh: THREE.Mesh; body: RAPIER.RigidBody; lastVelocity: THREE.Vector3 }> = [];

      function shootProjectile() {
        const geometry = new THREE.SphereGeometry(CONFIG.PROJECTILE_RADIUS, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0xff4444 });
        const mesh = new THREE.Mesh(geometry, material);

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.normalize();

        const origin = camera.position.clone().addScaledVector(forward, PROJECTILE_SPAWN_OFFSET);
        mesh.position.copy(origin);
        scene.add(mesh);

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true);
        const body = world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.ball(CONFIG.PROJECTILE_RADIUS).setRestitution(CONFIG.PROJECTILE_RESTITUTION);
        world.createCollider(colliderDesc, body);

        const velocity = forward.multiplyScalar(CONFIG.PROJECTILE_SPEED);
        body.setLinvel(velocity, true);

        projectiles.push({
          mesh,
          body,
          lastVelocity: velocity.clone(),
        });
        bodyToMesh.set(body.handle, mesh);
        projectileBodies.add(body.handle);
      }

      // Animation loop
      let previousTime = performance.now();
      let physicsAccumulator = 0;

      function animate(currentTime: number) {
        if (!mounted) return;

        requestAnimationFrame(animate);
        const frameTime = Math.min((currentTime - previousTime) / 1000, 0.1);
        previousTime = currentTime;

        setMeshRotationState((prev) => {
          if (!environment) return prev;
          if (
            prev.x === environment.rotation.x &&
            prev.y === environment.rotation.y &&
            prev.z === environment.rotation.z
          ) {
            return prev;
          }
          return {
            x: environment.rotation.x,
            y: environment.rotation.y,
            z: environment.rotation.z,
          };
        });

        updateMovement();

        for (const key of Object.keys(voiceCooldowns)) {
          if (voiceCooldowns[key] > 0) voiceCooldowns[key] -= frameTime;
        }

        physicsAccumulator += frameTime;
        const steps = Math.min(Math.floor(physicsAccumulator / FIXED_TIME_STEP), MAX_SUBSTEPS);
        for (let i = 0; i < steps; i++) {
          world.step();

          for (const projectile of projectiles) {
            const pos = projectile.body.translation();
            const rot = projectile.body.rotation();
            projectile.mesh.position.set(pos.x, pos.y, pos.z);
            projectile.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

            const currentVelocity = new THREE.Vector3(
              projectile.body.linvel().x,
              projectile.body.linvel().y,
              projectile.body.linvel().z
            );

            const velocityChange = currentVelocity.clone().sub(projectile.lastVelocity);
            if (velocityChange.length() > CONFIG.BOUNCE_DETECTION_THRESHOLD) {
              const position = new THREE.Vector3(pos.x, pos.y, pos.z);
              playBounceSound(position, currentVelocity);

              for (const character of ['orc', 'bartender']) {
                if (boneColliders[character]) {
                  const hit = boneColliders[character].some(({ bone }) => {
                    const bonePos = new THREE.Vector3();
                    bone.getWorldPosition(bonePos);
                    return position.distanceTo(bonePos) < CONFIG.CHARACTER_HIT_DISTANCE;
                  });
                  if (hit) playVoiceLine(character);
                }
              }
            }

            projectile.lastVelocity.copy(currentVelocity);
          }

          for (const block of jengaBlocks) {
            const pos = block.body.translation();
            const rot = block.body.rotation();
            block.mesh.position.set(pos.x, pos.y, pos.z);
            block.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
          }

          if (grabbed.body) {
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.normalize();
            const holdPos = camera.position.clone().addScaledVector(forward, CONFIG.GRAB.HOLD_DISTANCE);
            grabbed.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            grabbed.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            grabbed.body.setTranslation({ x: holdPos.x, y: holdPos.y, z: holdPos.z }, true);

            const yawForward = new THREE.Vector3(forward.x, 0, forward.z);
            if (yawForward.lengthSq() < 1e-6) yawForward.set(0, 0, 1);
            yawForward.normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(up, yawForward).normalize();
            const trueUp = new THREE.Vector3().crossVectors(yawForward, right).normalize();
            const basis = new THREE.Matrix4().makeBasis(right, trueUp, yawForward);
            const q = new THREE.Quaternion().setFromRotationMatrix(basis);
            grabbed.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          }

          physicsAccumulator -= FIXED_TIME_STEP;
        }

        if (playerBody) {
          const p = playerBody.translation();
          const feetY = p.y - (PLAYER_HALF_HEIGHT + PLAYER_RADIUS);
          camera.position.set(p.x, feetY + PLAYER_EYE_HEIGHT, p.z);
        }

        sparkRenderer?.update({ scene });
        updateHover();

        for (const mixer of Object.values(animationMixers)) {
          mixer?.update(frameTime);
        }

        for (const colliders of Object.values(boneColliders)) {
          for (const { bone, body } of colliders) {
            const pos = new THREE.Vector3();
            bone.getWorldPosition(pos);
            body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
          }
        }

        if (debugMode) {
          for (const character of ['orc', 'bartender']) {
            for (const { sphere, bone } of debugVisuals[character]) {
              bone.getWorldPosition(sphere.position);
            }
          }
        }

        renderer.render(scene, camera);
      }

      function updateHover() {
        if (hover.mesh && hover.savedEmissive != null) {
          const m = hover.mesh.material as THREE.MeshStandardMaterial;
          if (m && m.emissive) m.emissive.setHex(hover.savedEmissive);
        }
        hover = { body: null, mesh: null, savedEmissive: null };

        const raycaster = new THREE.Raycaster();
        raycaster.far = CONFIG.GRAB.MAX_DISTANCE;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects(grabbableMeshes, false);
        if (!hits || hits.length === 0) return;
        const hit = hits.find((h) => h.distance <= CONFIG.GRAB.MAX_DISTANCE);
        if (!hit) return;
        const mesh = hit.object as THREE.Mesh;
        const bestBody = meshToBody.get(mesh);
        if (!mesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive) {
          hover = { body: bestBody || null, mesh, savedEmissive: mat.emissive.getHex() };
          mat.emissive.setHex(CONFIG.GRAB.HIGHLIGHT_EMISSIVE);
        }
      }

      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);

      animate(previousTime);
      console.log('🚀 Tavern demo initialized successfully!');

      cleanupRef.current = () => {
        mounted = false;
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }

    initScene();

    return () => {
      mounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const handleStartClick = () => {
    if (controlsRef.current) {
      controlsRef.current.lock();
    }
  };

  return (
    <>
      <div ref={containerRef} className="w-full h-screen" />

      {showUI && (
        <>
          {/* Start Button Overlay */}
          <div
            ref={startButtonRef}
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30"
            onClick={handleStartClick}
          >
            <div className="text-center">
              <h2 className="text-4xl font-serif italic text-white mb-4">
                Ready to explore?
              </h2>
              <button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-6 px-12 rounded-full text-2xl mb-8 shadow-2xl transition-all hover:scale-105">
                Click to Start
              </button>
              <div className="bg-white/95 rounded-3xl p-6 text-gray-800 text-sm space-y-3 max-w-md mx-auto shadow-xl">
                <p className="font-bold text-lg mb-2">Controls:</p>
                <div className="grid grid-cols-2 gap-2 text-left">
                  <p><span className="font-semibold">WASD:</span> Move</p>
                  <p><span className="font-semibold">R/F:</span> Up/Down</p>
                  <p><span className="font-semibold">Space:</span> Jump</p>
                  <p><span className="font-semibold">Click:</span> Shoot/Grab</p>
                  <p><span className="font-semibold">M:</span> Debug</p>
                  <p><span className="font-semibold">L:</span> Whiteboard</p>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions at top */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <p className="text-white text-sm font-medium drop-shadow-lg">WASD: Move • R/F: Up/Down • Space: Jump • Click: Shoot/Grab • M: Debug • L: Whiteboard</p>
          </div>

          {/* Crosshair Reticle */}
          <div
            ref={reticleRef}
            className="fixed top-1/2 left-1/2 w-[18px] h-[18px] -ml-[9px] -mt-[9px] pointer-events-none opacity-85 z-20 hidden before:content-[''] before:absolute before:left-1/2 before:top-0 before:w-[2px] before:h-full before:-translate-x-1/2 before:bg-white after:content-[''] after:absolute after:top-1/2 after:left-0 after:w-full after:h-[2px] after:-translate-y-1/2 after:bg-white"
          />

          {/* Mesh rotation HUD */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium tracking-wide shadow-lg backdrop-blur pointer-events-none">
            <span className="mr-3">Mesh Rotation:</span>
            <span className="mr-3">X {formatRotation(meshRotationState.x)}</span>
            <span className="mr-3">Y {formatRotation(meshRotationState.y)}</span>
            <span>Z {formatRotation(meshRotationState.z)}</span>
          </div>
        </>
      )}

      {/* Whiteboard */}
      {showWhiteboard && <Whiteboard onClose={() => setShowWhiteboard(false)} />}
    </>
  );
}
