/* tslint:disable:no-unused-vars no-explicit-any*/

"use client";

import { isMarbleMeshUrl } from "@/utils/cdn-proxy";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const Whiteboard = dynamic(() => import("./Whiteboard"), { ssr: false });
const Inventory = dynamic(() => import("./Inventory"), { ssr: false });

import type { InventoryItem } from "./Inventory";

interface SceneProps {
  meshUrl: string;
  splatUrl: string;
  backgroundMusic?: string;
  walkingSound?: string;
}

const GLOBAL_SCALE = 0.7;

const CONFIG = {
  GRAVITY: { x: 0, y: -9.81 * GLOBAL_SCALE, z: 0 },
  RAPIER_INIT_TIMEOUT: 10000,
  MOVE_SPEED: 3 * GLOBAL_SCALE,
  PROJECTILE_SPEED: 15 * GLOBAL_SCALE,
  PROJECTILE_RADIUS: 0.2 * GLOBAL_SCALE,
  PROJECTILE_RESTITUTION: 0.9,
  ENVIRONMENT_RESTITUTION: 0.0,
  BOUNCE_DETECTION_THRESHOLD: 2.0,
  VELOCITY_PITCH_RANGE: { min: 0.9, max: 1.1 },
  VOLUME_DISTANCE_MAX: 10,
  ENVIRONMENT: {
    MESH: "test1.glb",
    SPLATS: "test1.spz",
    SPLAT_SCALE: 3,
  },
  AUDIO_FILES: {
    BOUNCE: "/bounce.mp3",
  },
  JENGA: {
    ENABLED: false,
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
const PROJECTILE_SPAWN_OFFSET =
  PLAYER_RADIUS + CONFIG.PROJECTILE_RADIUS + 0.15 * GLOBAL_SCALE;
const FIXED_TIME_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
const DYNAMIC_MODEL_SCALE = 0.5;

// Utility functions
function setupMaterialsForLighting(
  object: THREE.Object3D,
  brightnessMultiplier = 1.0
) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const newMaterials: THREE.Material[] = [];

      for (const material of materials) {
        if ("emissive" in material) {
          (material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
        if ("emissiveIntensity" in material) {
          (material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        }

        if (material.type === "MeshBasicMaterial") {
          const basicMat = material as THREE.MeshBasicMaterial;
          const newMaterial = new THREE.MeshStandardMaterial({
            color: basicMat.color,
            map: basicMat.map,
            roughness: 0.8,
            metalness: 0.1,
          });
          newMaterials.push(newMaterial);
        } else {
          if ("roughness" in material)
            (material as THREE.MeshStandardMaterial).roughness = 0.8;
          if ("metalness" in material)
            (material as THREE.MeshStandardMaterial).metalness = 0.1;
          if ("color" in material && brightnessMultiplier !== 1.0) {
            const currentColor = (
              material as THREE.MeshStandardMaterial
            ).color.clone();
            currentColor.multiplyScalar(brightnessMultiplier);
            (material as THREE.MeshStandardMaterial).color = currentColor;
          }
          if ("transparent" in material && "opacity" in material) {
            if (
              (material as THREE.MeshStandardMaterial).transparent &&
              (material as THREE.MeshStandardMaterial).opacity === 1
            ) {
              (material as THREE.MeshStandardMaterial).transparent = false;
            }
          }
          newMaterials.push(material);
        }
      }

      mesh.material = Array.isArray(mesh.material)
        ? newMaterials
        : newMaterials[0];
    }
  });
}

function playAudio(
  audioContext: AudioContext | null,
  buffer: AudioBuffer | null,
  volume = 1.0,
  playbackRate = 1.0,
  muted: boolean
) {
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

export default function Scene({
  meshUrl,
  splatUrl,
  backgroundMusic,
  walkingSound,
}: SceneProps) {
  console.log("rendering scene:", {
    meshUrl: meshUrl,
    splatUrl: splatUrl,
    backgroundMusic: backgroundMusic,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const startButtonRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const gameStartedRef = useRef(false);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const [showUI, setShowUI] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading scene...");
  // Determine mesh rotation based on URL source (Marble meshes vs our converted meshes)
  const isMarbleMesh = isMarbleMeshUrl(meshUrl);
  const meshRotation = isMarbleMesh
    ? [0, 0, 0]
    : [Math.PI / 2, Math.PI, Math.PI];

  const [meshRotationState, setMeshRotationState] = useState({
    x: meshRotation[0],
    y: meshRotation[1],
    z: meshRotation[2],
  });
  const [playerPositionState, setPlayerPositionState] = useState({
    x: 0,
    y: 0,
    z: 0,
  });

  const formatRotation = (radians: number) =>
    `${THREE.MathUtils.radToDeg(radians).toFixed(1)}° (${radians.toFixed(
      2
    )} rad)`;

  const formatPosition = (value: number) => value.toFixed(3);

  // Inventory items - easily extensible for future generated models
  const inventoryItems: InventoryItem[] = [
    {
      id: "orc",
      name: "Orc",
      modelUrl: "orc.glb",
      sfx: ["/sfx/orc_1.mp3", "/sfx/orc_2.mp3", "/sfx/orc_3.mp3"],
    },
    {
      id: "doggy",
      name: "Doggy",
      modelUrl: "/assets/doggy.glb",
      sfx: ["/sfx/dog_1.mp3", "/sfx/dog_2.mp3", "/sfx/dog_3.mp3"],
    },
    {
      id: "dragon",
      name: "Dragon",
      modelUrl: "/assets/dragon.glb",
      sfx: ["/sfx/dragon_1.mp3", "/sfx/dragon_2.mp3"],
    },
    {
      id: "furry",
      name: "Furry",
      modelUrl: "/assets/furry.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "peter-dink",
      name: "Peter Dink",
      modelUrl: "/assets/peter dink.glb",
    },
  ];

  useEffect(() => {
    setShowUI(true);
  }, []);

  // Initialize background music
  useEffect(() => {
    console.log(
      "[Background Music] useEffect triggered, backgroundMusic:",
      backgroundMusic
    );
    if (backgroundMusic) {
      console.log(
        "[Background Music] Creating audio element for:",
        backgroundMusic
      );
      const audio = new Audio(backgroundMusic);
      audio.loop = true;
      audio.volume = 0.3; // Set to 30% volume so it doesn't overpower
      backgroundMusicRef.current = audio;

      // Add event listeners for debugging
      audio.addEventListener("canplay", () => {
        console.log(
          "[Background Music] Audio can play, ready state:",
          audio.readyState
        );
      });
      audio.addEventListener("loadeddata", () => {
        console.log("[Background Music] Audio data loaded");
      });
      audio.addEventListener("error", (e) => {
        console.error("[Background Music] Audio error:", e, audio.error);
      });

      console.log("[Background Music] Audio element created successfully");

      return () => {
        // Cleanup on unmount
        console.log("[Background Music] Cleaning up audio element");
        if (backgroundMusicRef.current) {
          backgroundMusicRef.current.pause();
          backgroundMusicRef.current = null;
        }
      };
    } else {
      console.log("[Background Music] No background music provided");
    }
  }, [backgroundMusic]);

  useEffect(() => {
    const handleWhiteboardShortcut = (e: KeyboardEvent) => {
      // Handle Escape key for closing modals
      if (e.code === "Escape") {
        if (showTextModal) {
          setShowTextModal(false);
          setTimeout(() => {
            if (controlsRef.current) {
              controlsRef.current.lock();
            }
          }, 100);
          return;
        } else if (showWhiteboard) {
          setShowWhiteboard(false);
          setTimeout(() => {
            if (controlsRef.current) {
              controlsRef.current.lock();
            }
          }, 100);
          return;
        } else if (showUploadModal) {
          setShowUploadModal(false);
          setTimeout(() => {
            if (controlsRef.current) {
              controlsRef.current.lock();
            }
          }, 100);
          return;
        } else if (showInventory) {
          setShowInventory(false);
          setTimeout(() => {
            if (controlsRef.current) {
              controlsRef.current.lock();
            }
          }, 100);
          return;
        }
      }

      // Disable all other shortcuts when text modal is open (to allow typing)
      if (showTextModal) {
        return;
      }

      if (e.code === "KeyL") {
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
      } else if (e.code === "KeyU") {
        const newState = !showUploadModal;
        setShowUploadModal(newState);

        // Unlock pointer when opening upload modal, lock when closing
        if (controlsRef.current) {
          if (newState) {
            controlsRef.current.unlock();
          } else {
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }
        }
      } else if (e.code === "KeyT") {
        const newState = !showTextModal;
        setShowTextModal(newState);

        // Unlock pointer when opening text modal, lock when closing
        if (controlsRef.current) {
          if (newState) {
            controlsRef.current.unlock();
          } else {
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }
        }
      } else if (e.code === "KeyI") {
        const newState = !showInventory;
        setShowInventory(newState);

        // Unlock pointer when opening inventory, lock when closing
        if (controlsRef.current) {
          if (newState) {
            controlsRef.current.unlock();
          } else {
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }
        }
      } else if (e.code === "KeyH") {
        try {
          if (controlsRef.current) {
            controlsRef.current.unlock();
          }
        } catch {}
        window.location.href = "/";
      }
    };

    window.addEventListener("keydown", handleWhiteboardShortcut);
    return () =>
      window.removeEventListener("keydown", handleWhiteboardShortcut);
  }, [showWhiteboard, showUploadModal, showTextModal, showInventory]);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;
    const container = containerRef.current;

    async function initScene() {
      try {
        const initPromise = RAPIER.init();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Rapier initialization timeout")),
            CONFIG.RAPIER_INIT_TIMEOUT
          )
        );
        await Promise.race([initPromise, timeoutPromise]);
        console.log("✓ Rapier physics initialized");
      } catch (error) {
        console.error("Failed to initialize Rapier:", error);
        return;
      }

      if (!mounted) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x202020);

      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
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
      const jengaBlocks: Array<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }> =
        [];
      const dynamicModels: Array<{
        root: THREE.Object3D;
        body: RAPIER.RigidBody;
        lastVelocity: THREE.Vector3;
        soundEffects?: AudioBuffer[];
      }> = [];
      const bodyToMesh = new Map<number, THREE.Mesh>();
      const projectileBodies = new Set<number>();
      const meshToBody = new Map<THREE.Mesh, RAPIER.RigidBody>();
      const grabbableMeshes: THREE.Mesh[] = [];

      function buildJengaTower(
        world: RAPIER.World,
        scene: THREE.Scene,
        cfg: typeof CONFIG.JENGA
      ) {
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
          .setTranslation(0, 1, 0)
          .lockRotations()
          .setLinearDamping(4.0)
          .setCcdEnabled(true)
      );
      const colliderDesc = RAPIER.ColliderDesc.capsule(
        PLAYER_HALF_HEIGHT,
        PLAYER_RADIUS
      )
        .setFriction(0.8)
        .setRestitution(0.0);
      world.createCollider(colliderDesc, playerBody);

      const controls = new PointerLockControls(camera, renderer.domElement);
      controlsRef.current = controls;
      (
        window as Window & { __TAVERN_CONTROLS__?: PointerLockControls }
      ).__TAVERN_CONTROLS__ = controls;

      controls.addEventListener("lock", () => {
        console.log("[Background Music] Controls locked, game starting");
        gameStartedRef.current = true;
        if (reticleRef.current) reticleRef.current.style.display = "block";
        if (startButtonRef.current)
          startButtonRef.current.style.display = "none";

        // Start background music when user starts exploring
        console.log(
          "[Background Music] Checking if audio ref exists:",
          !!backgroundMusicRef.current
        );
        if (backgroundMusicRef.current) {
          console.log("[Background Music] Attempting to play audio...");
          console.log(
            "[Background Music] Audio state - paused:",
            backgroundMusicRef.current.paused,
            "readyState:",
            backgroundMusicRef.current.readyState,
            "src:",
            backgroundMusicRef.current.src
          );
          backgroundMusicRef.current
            .play()
            .then(() => {
              console.log("[Background Music] ✓ Audio playing successfully");
            })
            .catch((error) => {
              console.error(
                "[Background Music] ✗ Failed to play audio:",
                error
              );
              console.error("[Background Music] Error details:", {
                name: error.name,
                message: error.message,
                audioSrc: backgroundMusicRef.current?.src,
                audioReadyState: backgroundMusicRef.current?.readyState,
              });
            });
        } else {
          console.log("[Background Music] No audio element in ref");
        }
      });
      controls.addEventListener("unlock", () => {
        if (reticleRef.current) reticleRef.current.style.display = "none";
        // Only show start button if game hasn't started yet (not when whiteboard opens)
        if (startButtonRef.current && !gameStartedRef.current) {
          startButtonRef.current.style.display = "flex";
        }
      });

      // Audio system
      let audioContext: AudioContext | null = null;
      const audioBuffers: Record<string, AudioBuffer | AudioBuffer[]> = {};
      const muted = false;
      let walkingSoundSource: AudioBufferSourceNode | null = null;
      let isWalkingSoundPlaying = false;

      function initAudio() {
        if (audioContext) return;
        audioContext = new (window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)();

        // Load bounce sound
        fetch(CONFIG.AUDIO_FILES.BOUNCE)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to load audio: ${response.status}`);
            }
            return response.arrayBuffer();
          })
          .then((buffer) => audioContext!.decodeAudioData(buffer))
          .then((buffer) => {
            audioBuffers.bounce = buffer;
            console.log("✓ Bounce audio loaded");
          })
          .catch((error) => {
            console.warn("Bounce audio loading failed:", error);
          });

        // Load walking sound if provided
        if (walkingSound) {
          fetch(walkingSound)
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Failed to load walking audio: ${response.status}`
                );
              }
              return response.arrayBuffer();
            })
            .then((buffer) => audioContext!.decodeAudioData(buffer))
            .then((buffer) => {
              audioBuffers.walking = buffer;
              console.log("✓ Walking audio loaded");
            })
            .catch((error) => {
              console.warn("Walking audio loading failed:", error);
            });
        }
      }

      function playBounceSound(
        position: THREE.Vector3,
        velocity: THREE.Vector3
      ) {
        if (!audioContext || !audioBuffers.bounce) return;

        const distance = camera.position.distanceTo(position);
        let volume = Math.max(
          0.1,
          1.0 * (1 - distance / CONFIG.VOLUME_DISTANCE_MAX)
        );

        let pitch = 1.0;
        if (velocity) {
          const speed = velocity.length();
          const normalizedSpeed = Math.min(speed / 20, 1.0);
          volume *= 0.3 + normalizedSpeed * 0.7;
          pitch =
            CONFIG.VELOCITY_PITCH_RANGE.min +
            normalizedSpeed *
              (CONFIG.VELOCITY_PITCH_RANGE.max -
                CONFIG.VELOCITY_PITCH_RANGE.min);
          pitch *= 0.97 + Math.random() * 0.06;
        }

        playAudio(
          audioContext,
          audioBuffers.bounce as AudioBuffer,
          volume,
          pitch,
          muted
        );
      }

      function playWalkingSound() {
        if (!audioContext || !audioBuffers.walking || muted) return;
        if (isWalkingSoundPlaying) return;

        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();

        source.buffer = audioBuffers.walking as AudioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 0.4; // Walking sound at 40% volume
        source.loop = true; // Loop the walking sound
        source.start(0);

        walkingSoundSource = source;
        isWalkingSoundPlaying = true;
      }

      function stopWalkingSound() {
        if (walkingSoundSource && isWalkingSoundPlaying) {
          try {
            walkingSoundSource.stop();
          } catch (e) {
            // Already stopped
          }
          walkingSoundSource = null;
          isWalkingSoundPlaying = false;
        }
      }

      document.addEventListener("click", initAudio, { once: true });
      document.addEventListener("keydown", initAudio, { once: true });

      // Environment
      let environment: THREE.Group | null = null;
      let splatMesh: (THREE.Object3D & { numSplats?: number }) | null = null;
      let splatsLoaded = false;
      const envDebugMaterial = new THREE.MeshNormalMaterial();
      const originalEnvMaterials = new Map<
        string,
        THREE.Material | THREE.Material[]
      >();

      // Enable THREE.js cache for loaded resources
      THREE.Cache.enabled = true;

      /* ═══════════════════════════════════════════════════════════════
       * PERFORMANCE OPTIMIZATIONS
       * ═══════════════════════════════════════════════════════════════
       *
       * 1. MODEL CACHING: GLTFs are cached and cloned on subsequent loads
       *    - Avoids re-downloading and re-parsing the same models
       *    - Significantly faster when spawning duplicate items
       *
       * 2. AUDIO BUFFER CACHING: Sound effects are decoded once and reused
       *    - Prevents redundant network requests and audio decoding
       *    - Important when spawning many items with the same sounds
       *
       * 3. MATERIAL OPTIMIZATION: Materials are only converted once per model
       *    - setupMaterialsForLighting is expensive (MeshBasic → MeshStandard)
       *    - Memoization prevents redundant conversions on cached models
       *
       * 4. SIMPLIFIED PHYSICS COLLIDERS: Single cuboid per model instead of trimesh per mesh
       *    - Trimesh colliders are 10-100x slower than primitive shapes
       *    - Physics performance is critical for many dynamic objects
       *    - Trade-off: slightly less accurate collision but much better performance
       *
       * 5. RAYCASTING OPTIMIZATION: Reused raycaster + throttled updates
       *    - Creating new Raycaster objects every frame is wasteful
       *    - Update hover detection every N frames instead of every frame
       *    - Early exit if no grabbable objects or pointer unlocked
       *
       * 6. PROJECTILE POOLING: Shared geometry/material + max count
       *    - Prevents creating/destroying geometry every shot
       *    - Limits total projectiles to prevent memory bloat
       *    - Auto-removes oldest when limit reached
       *
       * Expected performance gains:
       * - Spawning cached models: 5-10x faster
       * - Physics simulation: 3-5x faster with many objects
       * - Raycasting: 2x faster
       * - Projectiles: No memory leaks, consistent FPS
       * ═══════════════════════════════════════════════════════════════ */

      const modelCache = new Map<string, GLTF>();
      const audioBufferCache = new Map<string, AudioBuffer>();
      const materialCache = new Map<string, boolean>(); // Track if materials are already converted

      const gltfLoader = new GLTFLoader();
      setLoadingMessage("Loading collision mesh...");

      gltfLoader.load(meshUrl, (gltf) => {
        environment = gltf.scene;
        environment.scale.set(-1, -1, 1);
        environment.rotation.set(
          meshRotation[0],
          meshRotation[1],
          meshRotation[2]
        );
        setMeshRotationState({
          x: environment.rotation.x,
          y: environment.rotation.y,
          z: environment.rotation.z,
        });
        environment.updateMatrixWorld(true);
        scene.add(environment);

        // Create a single fixed rigid body for all environment colliders
        const envBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

        environment.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const geometry = mesh.geometry.clone();
            mesh.updateWorldMatrix(true, false);
            geometry.applyMatrix4(mesh.matrixWorld);

            const vertices = new Float32Array(
              geometry.attributes.position.array
            );
            let indices: Uint32Array;

            if (geometry.index) {
              indices = new Uint32Array(geometry.index.array);
            } else {
              const count = geometry.attributes.position.count;
              indices = new Uint32Array(count);
              for (let i = 0; i < count; i++) indices[i] = i;
            }

            const colliderDesc = RAPIER.ColliderDesc.trimesh(
              vertices,
              indices
            ).setRestitution(CONFIG.ENVIRONMENT_RESTITUTION);
            world.createCollider(colliderDesc, envBody);
          }
        });

        console.log("✓ Environment collision mesh loaded");
        setLoadingMessage("Loading Gaussian splats...");
      });

      splatMesh = new SplatMesh({
        url: splatUrl,
        onLoad: () => {
          console.log(
            `✓ Gaussian splats loaded (${splatMesh!.numSplats} splats)`
          );
          splatsLoaded = true;
          if (environment) environment.visible = false;
          scene.add(splatMesh!);
          setIsLoading(false);
        },
      });

      const { SPLAT_SCALE } = CONFIG.ENVIRONMENT;
      splatMesh.scale.set(SPLAT_SCALE, -SPLAT_SCALE, SPLAT_SCALE);
      splatMesh.position.set(0, 0, 0);

      // Characters (none in generic scene)
      const animationMixers: Record<string, THREE.AnimationMixer> = {};
      const boneColliders: Record<
        string,
        Array<{ bone: THREE.Bone; body: RAPIER.RigidBody }>
      > = {};

      async function loadDynamicModel(
        url: string,
        soundUrls?: string[]
      ): Promise<void> {
        try {
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();
          const spawnPosition = camera.position
            .clone()
            .addScaledVector(forward, 3);

          // Load sound effects if provided (with caching)
          let soundBuffers: AudioBuffer[] | undefined;
          if (soundUrls && soundUrls.length > 0 && audioContext) {
            soundBuffers = [];
            for (const soundUrl of soundUrls) {
              try {
                // Check cache first
                if (audioBufferCache.has(soundUrl)) {
                  soundBuffers.push(audioBufferCache.get(soundUrl)!);
                } else {
                  const response = await fetch(soundUrl);
                  const arrayBuffer = await response.arrayBuffer();
                  const audioBuffer = await audioContext.decodeAudioData(
                    arrayBuffer
                  );
                  audioBufferCache.set(soundUrl, audioBuffer);
                  soundBuffers.push(audioBuffer);
                }
              } catch (error) {
                console.warn(`Failed to load sound ${soundUrl}:`, error);
              }
            }
          }

          let loadUrl = url;
          try {
            const parsed = new URL(url, window.location.href);
            const currentOrigin = window.location.origin;
            if (parsed.origin !== currentOrigin) {
              loadUrl = `/api/whiteboard/model?url=${encodeURIComponent(
                parsed.href
              )}`;
            }
          } catch {
            // Fallback to proxy attempt if url is relative but still errors
            loadUrl = `/api/whiteboard/model?url=${encodeURIComponent(url)}`;
          }

          // Check model cache first
          let gltf: GLTF;
          if (modelCache.has(loadUrl)) {
            // Clone the cached GLTF scene to avoid mutating the original
            const cachedGltf = modelCache.get(loadUrl)!;
            gltf = {
              scene: cachedGltf.scene.clone(true),
              scenes: cachedGltf.scenes,
              cameras: cachedGltf.cameras,
              animations: cachedGltf.animations,
              asset: cachedGltf.asset,
              parser: cachedGltf.parser,
              userData: cachedGltf.userData,
            };
          } else {
            gltf = await new Promise<GLTF>((resolve, reject) => {
              gltfLoader.load(
                loadUrl,
                (loaded) => {
                  modelCache.set(loadUrl, loaded);
                  resolve(loaded);
                },
                undefined,
                (error) => reject(error)
              );
            });
          }

          // Only setup materials if not already done for this model
          if (!materialCache.has(loadUrl)) {
            setupMaterialsForLighting(gltf.scene);
            materialCache.set(loadUrl, true);
          }
          gltf.scene.position.copy(spawnPosition);
          gltf.scene.rotation.set(0, 0, 0);
          gltf.scene.scale.set(1, 1, 1);
          gltf.scene.updateMatrixWorld(true);

          const initialQuaternion = new THREE.Quaternion();
          gltf.scene.getWorldQuaternion(initialQuaternion);

          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
            .setRotation({
              x: initialQuaternion.x,
              y: initialQuaternion.y,
              z: initialQuaternion.z,
              w: initialQuaternion.w,
            })
            .setCanSleep(true)
            .setLinearDamping(0.1)
            .setAngularDamping(0.2);
          const sharedBody = world.createRigidBody(bodyDesc);

          const dynamicEntry: {
            root: THREE.Object3D;
            body: RAPIER.RigidBody;
            lastVelocity: THREE.Vector3;
            soundEffects?: AudioBuffer[];
          } = {
            root: new THREE.Object3D(),
            body: sharedBody,
            lastVelocity: new THREE.Vector3(0, 0, 0),
            soundEffects: soundBuffers,
          };
          dynamicEntry.root.position.copy(spawnPosition);
          dynamicEntry.root.quaternion.copy(initialQuaternion);
          scene.add(dynamicEntry.root);
          dynamicEntry.root.updateMatrixWorld(true);

          // Play spawn sound
          if (soundBuffers && soundBuffers.length > 0 && audioContext) {
            const randomSound =
              soundBuffers[Math.floor(Math.random() * soundBuffers.length)];
            playAudio(audioContext, randomSound, 0.6, 1.0, muted);
          }
          const parentQuaternionInverse = dynamicEntry.root.quaternion
            .clone()
            .invert();

          const tempPosition = new THREE.Vector3();
          const tempQuaternion = new THREE.Quaternion();
          const tempScale = new THREE.Vector3();
          const tempBox = new THREE.Box3();

          // Performance optimization: Use a single compound bounding box instead of trimesh for each mesh
          const meshes: THREE.Mesh[] = [];
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              meshes.push(child as THREE.Mesh);
            }
          });

          // Calculate overall bounding box for the entire model (more efficient than per-mesh colliders)
          const overallBox = new THREE.Box3();
          for (const mesh of meshes) {
            mesh.updateWorldMatrix(true, false);
            tempBox.setFromObject(mesh);
            overallBox.union(tempBox);
          }

          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          overallBox.getCenter(center);
          overallBox.getSize(size);

          // Transform to local space
          const localCenter = center.clone();
          dynamicEntry.root.worldToLocal(localCenter);
          localCenter.multiplyScalar(DYNAMIC_MODEL_SCALE);

          const halfExtents = size
            .clone()
            .multiplyScalar(DYNAMIC_MODEL_SCALE * 0.5);

          // Create a single cuboid collider for the entire model (much faster than trimesh)
          const colliderDesc = RAPIER.ColliderDesc.cuboid(
            halfExtents.x,
            halfExtents.y,
            halfExtents.z
          )
            .setTranslation(localCenter.x, localCenter.y, localCenter.z)
            .setFriction(0.8)
            .setRestitution(0.05);
          world.createCollider(colliderDesc, sharedBody);

          // Add meshes to the scene
          gltf.scene.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;

            mesh.updateWorldMatrix(true, false);
            mesh.matrixWorld.decompose(tempPosition, tempQuaternion, tempScale);

            const scaledScale = new THREE.Vector3(
              tempScale.x * DYNAMIC_MODEL_SCALE,
              tempScale.y * DYNAMIC_MODEL_SCALE,
              tempScale.z * DYNAMIC_MODEL_SCALE
            );

            const worldPosition = tempPosition.clone();
            const localPosition = worldPosition.clone();
            dynamicEntry.root.worldToLocal(localPosition);
            localPosition.multiplyScalar(DYNAMIC_MODEL_SCALE);

            const localQuaternion = tempQuaternion
              .clone()
              .premultiply(parentQuaternionInverse);

            mesh.parent?.remove(mesh);
            mesh.position.copy(localPosition);
            mesh.quaternion.copy(localQuaternion);
            mesh.scale.copy(scaledScale);
            dynamicEntry.root.add(mesh);

            meshToBody.set(mesh, sharedBody);
            grabbableMeshes.push(mesh);
          });

          bodyToMesh.set(sharedBody.handle, dynamicEntry.root as THREE.Mesh);
          dynamicModels.push(dynamicEntry);
        } catch (error) {
          console.error("Error loading dynamic model:", error);
          throw error;
        }
      }

      (window as any).__LOAD_DYNAMIC_MODEL__ = loadDynamicModel;

      // Input handling
      const keyState: Record<string, boolean> = {};
      let debugMode = false;

      let hover: {
        body: RAPIER.RigidBody | null;
        mesh: THREE.Mesh | null;
        savedEmissive: number | null;
      } = {
        body: null,
        mesh: null,
        savedEmissive: null,
      };
      let grabbed: { body: RAPIER.RigidBody | null; mesh: THREE.Mesh | null } =
        { body: null, mesh: null };
      let grabbedRotationX = 0; // Pitch rotation
      let grabbedRotationY = 0; // Yaw rotation
      let grabbedRotationZ = 0; // Roll rotation
      const ROTATION_SPEED = 0.05; // Radians per frame
      const LAUNCH_SPEED = 15 * GLOBAL_SCALE;

      const handleKeyDown = (e: KeyboardEvent) => {
        keyState[e.code] = true;

        if (e.code === "KeyM") {
          debugMode = !debugMode;
          toggleDebugMode();
        }

        if (e.code === "Space" && playerBody) {
          if (isPlayerGrounded()) {
            const v = playerBody.linvel();
            playerBody.setLinvel(
              { x: v.x, y: PLAYER_JUMP_SPEED, z: v.z },
              true
            );
          }
        }

        // Launch grabbed object with period key
        if (e.code === "Period" && grabbed.body) {
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();
          const launchVelocity = forward.multiplyScalar(LAUNCH_SPEED);
          grabbed.body.setLinvel(
            { x: launchVelocity.x, y: launchVelocity.y, z: launchVelocity.z },
            true
          );
          grabbed = { body: null, mesh: null };
          grabbedRotationX = 0;
          grabbedRotationY = 0;
          grabbedRotationZ = 0;
          console.log("Object launched!");
        }

        if (e.code === "KeyP") {
          if (playerBody) {
            const p = playerBody.translation();
            const posStr = `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(
              3
            )}, ${p.z.toFixed(3)})`;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.normalize();
            const yaw = (Math.atan2(forward.x, forward.z) * 180) / Math.PI;
            const pitch =
              (Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)) * 180) /
              Math.PI;
            console.log(
              `[Player] ${posStr}  yaw=${yaw.toFixed(
                1
              )}°  pitch=${pitch.toFixed(1)}°`
            );
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        keyState[e.code] = false;
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      renderer.domElement.addEventListener("click", () => {
        if (!controls.isLocked) return;
        if (grabbed.body) {
          grabbed = { body: null, mesh: null };
          grabbedRotationX = 0;
          grabbedRotationY = 0;
          grabbedRotationZ = 0;
          return;
        }
        if (hover.body && hover.mesh) {
          grabbed = { body: hover.body, mesh: hover.mesh };
          grabbedRotationX = 0;
          grabbedRotationY = 0;
          grabbedRotationZ = 0;
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
        const nearGround =
          hit.timeOfImpact <= footOffset + 0.12 && normalY > 0.3;
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
        const isMovingHorizontally = moveDir.lengthSq() > 0;
        if (isMovingHorizontally) {
          moveDir.normalize().multiplyScalar(CONFIG.MOVE_SPEED);
          targetX = moveDir.x;
          targetZ = moveDir.z;
        }

        const current = playerBody.linvel();
        let targetY = current.y;
        if (keyState.KeyR) targetY += CONFIG.MOVE_SPEED;
        if (keyState.KeyF) targetY -= CONFIG.MOVE_SPEED;

        playerBody.setLinvel({ x: targetX, y: targetY, z: targetZ }, true);

        // Handle walking sound
        const grounded = isPlayerGrounded();
        if (isMovingHorizontally && grounded && audioBuffers.walking) {
          playWalkingSound();
        } else {
          stopWalkingSound();
        }
      }

      // Projectiles with object pooling and limits
      const projectiles: Array<{
        mesh: THREE.Mesh;
        body: RAPIER.RigidBody;
        lastVelocity: THREE.Vector3;
      }> = [];
      const MAX_PROJECTILES = 50; // Limit to prevent memory issues
      const projectileGeometry = new THREE.SphereGeometry(
        CONFIG.PROJECTILE_RADIUS,
        16,
        16
      );
      const projectileMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4444,
      });

      function shootProjectile() {
        // Remove oldest projectile if at limit
        if (projectiles.length >= MAX_PROJECTILES) {
          const oldest = projectiles.shift();
          if (oldest) {
            scene.remove(oldest.mesh);
            // Don't dispose geometry/material since they're shared
            try {
              world.removeRigidBody(oldest.body);
            } catch {
              // Body may already be removed
            }
            bodyToMesh.delete(oldest.body.handle);
            projectileBodies.delete(oldest.body.handle);
          }
        }
        // Reuse shared geometry and material for better performance
        const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.normalize();

        const origin = camera.position
          .clone()
          .addScaledVector(forward, PROJECTILE_SPAWN_OFFSET);
        mesh.position.copy(origin);
        scene.add(mesh);

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(origin.x, origin.y, origin.z)
          .setCcdEnabled(true);
        const body = world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.ball(
          CONFIG.PROJECTILE_RADIUS
        ).setRestitution(CONFIG.PROJECTILE_RESTITUTION);
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
      let animationFrameId: number;

      function animate(currentTime: number) {
        if (!mounted) return;

        animationFrameId = requestAnimationFrame(animate);
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

        physicsAccumulator += frameTime;
        const steps = Math.min(
          Math.floor(physicsAccumulator / FIXED_TIME_STEP),
          MAX_SUBSTEPS
        );
        for (let i = 0; i < steps; i++) {
          if (!mounted) break;
          try {
            world.step();
          } catch {
            // World disposed during cleanup
            return;
          }

          for (const projectile of projectiles) {
            if (!mounted) break;
            try {
              const pos = projectile.body.translation();
              const rot = projectile.body.rotation();
              projectile.mesh.position.set(pos.x, pos.y, pos.z);
              projectile.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

              const currentVelocity = new THREE.Vector3(
                projectile.body.linvel().x,
                projectile.body.linvel().y,
                projectile.body.linvel().z
              );

              const velocityChange = currentVelocity
                .clone()
                .sub(projectile.lastVelocity);
              if (velocityChange.length() > CONFIG.BOUNCE_DETECTION_THRESHOLD) {
                const position = new THREE.Vector3(pos.x, pos.y, pos.z);
                playBounceSound(position, currentVelocity);
              }

              projectile.lastVelocity.copy(currentVelocity);
            } catch {
              continue;
            }
          }

          for (const block of jengaBlocks) {
            if (!mounted) break;
            try {
              const pos = block.body.translation();
              const rot = block.body.rotation();
              block.mesh.position.set(pos.x, pos.y, pos.z);
              block.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
            } catch {
              continue;
            }
          }

          for (const model of dynamicModels) {
            if (!mounted) break;
            try {
              const pos = model.body.translation();
              const rot = model.body.rotation();
              model.root.position.set(pos.x, pos.y, pos.z);
              model.root.quaternion.set(rot.x, rot.y, rot.z, rot.w);

              // Check for collisions and play sounds
              if (model.soundEffects && model.soundEffects.length > 0) {
                const currentVelocity = new THREE.Vector3(
                  model.body.linvel().x,
                  model.body.linvel().y,
                  model.body.linvel().z
                );

                const velocityChange = currentVelocity
                  .clone()
                  .sub(model.lastVelocity);

                // If significant velocity change (collision detected)
                if (
                  velocityChange.length() > CONFIG.BOUNCE_DETECTION_THRESHOLD
                ) {
                  const position = new THREE.Vector3(pos.x, pos.y, pos.z);
                  const distance = camera.position.distanceTo(position);
                  const volume = Math.max(
                    0.2,
                    0.8 * (1 - distance / CONFIG.VOLUME_DISTANCE_MAX)
                  );

                  // Play random sound from the array
                  const randomSound =
                    model.soundEffects[
                      Math.floor(Math.random() * model.soundEffects.length)
                    ];
                  playAudio(audioContext, randomSound, volume, 1.0, muted);
                }

                model.lastVelocity.copy(currentVelocity);
              }
            } catch {
              continue;
            }
          }

          if (grabbed.body && mounted) {
            try {
              // Handle arrow key rotation
              let rotated = false;
              if (keyState.ArrowUp) {
                grabbedRotationX += ROTATION_SPEED;
                rotated = true;
              }
              if (keyState.ArrowDown) {
                grabbedRotationX -= ROTATION_SPEED;
                rotated = true;
              }
              if (keyState.ArrowLeft) {
                grabbedRotationY += ROTATION_SPEED;
                rotated = true;
              }
              if (keyState.ArrowRight) {
                grabbedRotationY -= ROTATION_SPEED;
                rotated = true;
              }

              if (rotated && i === 0) {
                console.log(
                  `Rotation: X=${grabbedRotationX.toFixed(
                    2
                  )}, Y=${grabbedRotationY.toFixed(2)}`
                );
              }

              const forward = new THREE.Vector3();
              camera.getWorldDirection(forward);
              forward.normalize();
              const holdPos = camera.position
                .clone()
                .addScaledVector(forward, CONFIG.GRAB.HOLD_DISTANCE);
              grabbed.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              grabbed.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
              grabbed.body.setTranslation(
                { x: holdPos.x, y: holdPos.y, z: holdPos.z },
                true
              );

              // Apply rotation using Euler angles
              const euler = new THREE.Euler(
                grabbedRotationX,
                grabbedRotationY,
                grabbedRotationZ,
                "XYZ"
              );
              const rotation = new THREE.Quaternion().setFromEuler(euler);

              grabbed.body.setRotation(
                { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
                true
              );
            } catch {
              // Physics body freed during cleanup
            }
          }

          physicsAccumulator -= FIXED_TIME_STEP;
        }

        if (playerBody && mounted) {
          try {
            const p = playerBody.translation();
            const feetY = p.y - (PLAYER_HALF_HEIGHT + PLAYER_RADIUS);
            camera.position.set(p.x, feetY + PLAYER_EYE_HEIGHT, p.z);

            setPlayerPositionState((prev) => {
              if (prev.x === p.x && prev.y === p.y && prev.z === p.z) {
                return prev;
              }
              return { x: p.x, y: p.y, z: p.z };
            });
          } catch (error) {
            // Physics body may have been freed during cleanup
            console.warn(
              "Physics body access error (likely during cleanup):",
              error
            );
            return;
          }
        }

        sparkRenderer?.update({ scene });
        updateHover();

        for (const mixer of Object.values(animationMixers)) {
          mixer?.update(frameTime);
        }

        renderer.render(scene, camera);
      }

      // Optimize raycasting: reuse raycaster and limit update frequency
      const raycaster = new THREE.Raycaster();
      raycaster.far = CONFIG.GRAB.MAX_DISTANCE;
      let hoverUpdateCounter = 0;
      const HOVER_UPDATE_INTERVAL = 2; // Update every N frames instead of every frame

      function updateHover() {
        // Limit hover updates to every few frames for better performance
        hoverUpdateCounter++;
        if (hoverUpdateCounter < HOVER_UPDATE_INTERVAL) return;
        hoverUpdateCounter = 0;

        if (hover.mesh && hover.savedEmissive != null) {
          const m = hover.mesh.material as THREE.MeshStandardMaterial;
          if (m && m.emissive) m.emissive.setHex(hover.savedEmissive);
        }
        hover = { body: null, mesh: null, savedEmissive: null };

        // Early exit if no grabbable objects or pointer is not locked
        if (grabbableMeshes.length === 0 || !controls.isLocked) return;

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
          hover = {
            body: bestBody || null,
            mesh,
            savedEmissive: mat.emissive.getHex(),
          };
          mat.emissive.setHex(CONFIG.GRAB.HIGHLIGHT_EMISSIVE);
        }
      }

      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", handleResize);

      animate(previousTime);
      console.log("🚀 Tavern demo initialized successfully!");

      cleanupRef.current = () => {
        mounted = false;
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("resize", handleResize);

        // Stop background music
        if (backgroundMusicRef.current) {
          console.log("[Background Music] Pausing audio in cleanup");
          backgroundMusicRef.current.pause();
        }

        // Stop walking sound
        stopWalkingSound();

        // Dispose shared projectile resources
        projectileGeometry.dispose();
        projectileMaterial.dispose();

        // Clear caches
        modelCache.clear();
        audioBufferCache.clear();
        materialCache.clear();

        // Dispose physics world
        try {
          if (world && typeof world.free === "function") {
            world.free();
          }
        } catch (error) {
          console.warn("Error disposing physics world:", error);
        }

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

  const handleSelectItem = async (item: InventoryItem) => {
    try {
      // Load the model dynamically using the global function
      if ((window as any).__LOAD_DYNAMIC_MODEL__) {
        await (window as any).__LOAD_DYNAMIC_MODEL__(item.modelUrl, item.sfx);
        console.log(`Spawned ${item.name} from inventory with sound effects`);
      } else {
        console.error("Dynamic model loading not available yet");
      }
    } catch (error) {
      console.error(`Error spawning ${item.name}:`, error);
    }
  };

  const handleInventoryClose = () => {
    setShowInventory(false);
    setTimeout(() => {
      if (controlsRef.current) {
        controlsRef.current.lock();
      }
    }, 100);
  };

  const handleTextToModel = async (
    prompt: string,
    artStyle: string = "realistic"
  ) => {
    if (!prompt.trim()) {
      setUploadProgress("Error: Please enter a description.");
      return;
    }

    try {
      setIsGenerating(true);
      setGenerationProgress(0);
      setUploadProgress("Creating preview model...");

      // Stage 1: Create preview task
      const previewResponse = await fetch("/api/whiteboard/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "preview",
          prompt: prompt.trim(),
          art_style: artStyle,
          ai_model: "latest",
        }),
      });

      if (!previewResponse.ok) {
        const errorData = await previewResponse.json();
        throw new Error(errorData.error || "Failed to create preview");
      }

      const previewData = await previewResponse.json();
      const previewTaskId = previewData.result;

      if (!previewTaskId) {
        throw new Error("No preview task ID received");
      }

      setUploadProgress("Generating 3D mesh...");
      setGenerationProgress(10);

      // Poll for preview completion
      const maxTries = 100;
      const delayMs = 5000;
      let previewComplete = false;

      for (let i = 0; i < maxTries; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const statusRes = await fetch(
          `/api/whiteboard/text?id=${previewTaskId}`
        );
        if (!statusRes.ok) {
          throw new Error("Failed to check preview status");
        }

        const statusData = await statusRes.json();
        const progress = statusData.progress || 0;
        setGenerationProgress(Math.max(10, Math.min(45, 10 + progress * 0.35)));

        if (progress > 0 && progress < 100) {
          setUploadProgress(`Generating mesh... ${progress}% complete`);
        }

        if (statusData.status === "SUCCEEDED") {
          previewComplete = true;
          break;
        } else if (statusData.status === "FAILED") {
          const errorMsg =
            statusData.task_error?.message || "Preview generation failed";
          alert(`❌ Model Generation Failed\n\n${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      if (!previewComplete) {
        throw new Error("Preview generation timeout");
      }

      // Stage 2: Create refine task
      setUploadProgress("Adding textures...");
      setGenerationProgress(50);

      const refineResponse = await fetch("/api/whiteboard/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "refine",
          preview_task_id: previewTaskId,
          enable_pbr: true,
        }),
      });

      if (!refineResponse.ok) {
        const errorData = await refineResponse.json();
        throw new Error(errorData.error || "Failed to create refine task");
      }

      const refineData = await refineResponse.json();
      const refineTaskId = refineData.result;

      if (!refineTaskId) {
        throw new Error("No refine task ID received");
      }

      // Poll for refine completion
      for (let i = 0; i < maxTries; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const statusRes = await fetch(
          `/api/whiteboard/text?id=${refineTaskId}`
        );
        if (!statusRes.ok) {
          throw new Error("Failed to check refine status");
        }

        const statusData = await statusRes.json();
        const progress = statusData.progress || 0;
        setGenerationProgress(Math.max(50, Math.min(95, 50 + progress * 0.45)));

        if (progress > 0 && progress < 100) {
          setUploadProgress(`Adding textures... ${progress}% complete`);
        }

        if (statusData.status === "SUCCEEDED") {
          if (statusData.model_urls?.glb) {
            setGenerationProgress(100);
            setUploadProgress("Loading model into scene...");

            // Load the model
            if ((window as any).__LOAD_DYNAMIC_MODEL__) {
              await (window as any).__LOAD_DYNAMIC_MODEL__(
                statusData.model_urls.glb
              );
            }

            setUploadProgress("✓ Model loaded successfully!");
            setTimeout(() => {
              setShowTextModal(false);
              setUploadProgress("");
              setIsGenerating(false);
              setGenerationProgress(0);
              setTimeout(() => {
                if (controlsRef.current) {
                  controlsRef.current.lock();
                }
              }, 100);
            }, 2000);
            return;
          } else {
            throw new Error("No GLB model URL in response");
          }
        } else if (statusData.status === "FAILED") {
          const errorMsg =
            statusData.task_error?.message || "Texture generation failed";
          alert(`❌ Texture Generation Failed\n\n${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      throw new Error("Texture generation timeout");
    } catch (error) {
      console.error("Error generating model from text:", error);
      setUploadProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setUploadProgress("Error: Please upload a JPG, JPEG, PNG, or WebP file.");
      return;
    }

    try {
      setIsGenerating(true);
      setGenerationProgress(0);
      setUploadProgress("Converting image to base64...");

      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataUri = await base64Promise;

      setUploadProgress("Generating your creation...");
      setGenerationProgress(5);

      // Send to backend API - returns immediately with task ID
      const response = await fetch("/api/whiteboard/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: dataUri,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate model");
      }

      const data = await response.json();
      const taskId = data.id;
      console.log("Meshy task created:", taskId);

      // Start progress polling with taskId
      const progressInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/whiteboard/status?taskId=${taskId}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const progress = statusData.progress || 0;
            const provider = statusData.provider || "meshy";
            setGenerationProgress(Math.max(5, Math.min(95, progress)));

            if (progress > 0 && progress < 100) {
              setUploadProgress(`Generating model... ${progress}% complete`);
            }
          }
        } catch (err) {
          console.error("Error polling status:", err);
        }
      }, 5000);

      // Poll for completion (webhook updates the status file)
      const maxTries = 100;
      const delayMs = 5000;

      for (let i = 0; i < maxTries; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const statusRes = await fetch(
          `/api/whiteboard/status?taskId=${taskId}`
        );
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();

        if (statusData.status === "FAILED") {
          clearInterval(progressInterval);
          const errorMsg =
            statusData.task_error?.message || "Model generation failed";
          alert(`❌ Model Generation Failed\n\n${errorMsg}`);
          throw new Error(errorMsg);
        }

        if (statusData.status === "SUCCEEDED" && statusData.model_urls?.glb) {
          clearInterval(progressInterval);
          setGenerationProgress(100);
          setUploadProgress("Loading model into scene...");

          // Load the model using the existing function
          if ((window as any).__LOAD_DYNAMIC_MODEL__) {
            await (window as any).__LOAD_DYNAMIC_MODEL__(
              statusData.model_urls.glb
            );
          }

          setUploadProgress("✓ Model loaded successfully!");
          setTimeout(() => {
            setShowUploadModal(false);
            setUploadProgress("");
            setIsGenerating(false);
            setGenerationProgress(0);
            // Re-lock pointer
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }, 2000);
          return;
        }
      }

      clearInterval(progressInterval);
      throw new Error("Model generation timeout");
    } catch (error) {
      console.error("Error generating model:", error);
      setUploadProgress(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  return (
    <>
      <div ref={containerRef} className="w-full h-screen" />

      {/* Loading Screen */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-center">
            <div className="mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto"></div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Loading World
            </h2>
            <p className="text-gray-400 text-lg">{loadingMessage}</p>
          </div>
        </div>
      )}

      {showUI && !isLoading && (
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
                  <p>
                    <span className="font-semibold">WASD:</span> Move
                  </p>
                  <p>
                    <span className="font-semibold">R/F:</span> Up/Down
                  </p>
                  <p>
                    <span className="font-semibold">Space:</span> Jump
                  </p>
                  <p>
                    <span className="font-semibold">Click:</span> Shoot/Grab
                  </p>
                  <p>
                    <span className="font-semibold">Arrows:</span> Rotate
                  </p>
                  <p>
                    <span className="font-semibold">Period:</span> Launch
                  </p>
                  <p>
                    <span className="font-semibold">M:</span> Debug
                  </p>
                  <p>
                    <span className="font-semibold">L:</span> Whiteboard
                  </p>
                  <p>
                    <span className="font-semibold">U:</span> Upload Model
                  </p>
                  <p>
                    <span className="font-semibold">T:</span> Text to Model
                  </p>
                  <p>
                    <span className="font-semibold">I:</span> Inventory
                  </p>
                  <p>
                    <span className="font-semibold">H:</span> Home
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Home Link */}
          <Link
            href="/"
            className="absolute top-4 left-4 z-40 bg-black/60 hover:bg-black/80 text-white text-sm font-medium px-3 py-1.5 rounded-full backdrop-blur"
          >
            ← Home
          </Link>

          {/* Instructions at top */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <p className="text-white text-sm font-medium drop-shadow-lg">
              WASD: Move • R/F: Up/Down • Space: Jump • Click: Shoot/Grab •
              Arrows: Rotate • .: Launch • M: Debug • L: Whiteboard • U: Upload
              • T: Text • I: Inventory • H: Home
            </p>
          </div>

          {/* Crosshair Reticle */}
          <div
            ref={reticleRef}
            className="fixed top-1/2 left-1/2 w-[18px] h-[18px] -ml-[9px] -mt-[9px] pointer-events-none opacity-85 z-20 hidden before:content-[''] before:absolute before:left-1/2 before:top-0 before:w-[2px] before:h-full before:-translate-x-1/2 before:bg-white after:content-[''] after:absolute after:top-1/2 after:left-0 after:w-full after:h-[2px] after:-translate-y-1/2 after:bg-white"
          />

          {/* Player position HUD */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium tracking-wide shadow-lg backdrop-blur pointer-events-none">
            <span className="mr-3">Player Position:</span>
            <span className="mr-3">
              X {formatPosition(playerPositionState.x)}
            </span>
            <span className="mr-3">
              Y {formatPosition(playerPositionState.y)}
            </span>
            <span>Z {formatPosition(playerPositionState.z)}</span>
          </div>

          {/* Model Generation Progress Bar */}
          {isGenerating && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-4 rounded-2xl shadow-2xl backdrop-blur z-30 min-w-[400px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">
                  Generating 3D Model...
                </span>
                <span className="text-sm font-bold text-purple-400">
                  {generationProgress}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-300 mt-2">{uploadProgress}</p>
            </div>
          )}
        </>
      )}

      {/* Whiteboard */}
      {showWhiteboard && (
        <Whiteboard
          onClose={() => {
            setShowWhiteboard(false);
            // Re-lock pointer after closing
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
          }}
          onGenerationStart={() => {
            setIsGenerating(true);
            setGenerationProgress(0);
          }}
          onGenerationProgress={(progress, message) => {
            setGenerationProgress(progress);
            setUploadProgress(message);
          }}
          onGenerationComplete={() => {
            setIsGenerating(false);
            setGenerationProgress(0);
            setUploadProgress("");
          }}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Generate 3D Model from Image
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              Upload an image (JPG, JPEG, PNG, or WebP) to generate a 3D model
              using Meshy AI.
            </p>

            {!isGenerating ? (
              <>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 mb-4"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      setTimeout(() => {
                        if (controlsRef.current) {
                          controlsRef.current.lock();
                        }
                      }, 100);
                    }}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
                <p className="text-center text-gray-700 font-medium">
                  {uploadProgress}
                </p>
                <p className="text-center text-gray-500 text-xs">
                  This may take a few minutes...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Text to 3D Modal */}
      {showTextModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Generate 3D Model from Text
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              Describe a 3D object and Meshy AI will generate it for you.
            </p>

            {!isGenerating ? (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const prompt = formData.get("prompt") as string;
                    const artStyle = formData.get("artStyle") as string;
                    handleTextToModel(prompt, artStyle);
                  }}
                >
                  <div className="mb-4">
                    <label
                      htmlFor="prompt"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Description
                    </label>
                    <textarea
                      id="prompt"
                      name="prompt"
                      rows={4}
                      placeholder="e.g., a medieval sword with golden handle, a cute robot character, a fantasy castle..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-gray-800"
                      maxLength={600}
                      required
                    />
                  </div>

                  <div className="mb-6">
                    <label
                      htmlFor="artStyle"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Art Style
                    </label>
                    <select
                      id="artStyle"
                      name="artStyle"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-800"
                    >
                      <option value="realistic">Realistic</option>
                      <option value="sculpture">Sculpture</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTextModal(false);
                        setTimeout(() => {
                          if (controlsRef.current) {
                            controlsRef.current.lock();
                          }
                        }, 100);
                      }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
                <p className="text-center text-gray-700 font-medium">
                  {uploadProgress}
                </p>
                <p className="text-center text-gray-500 text-xs">
                  This may take several minutes...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inventory */}
      {showInventory && (
        <Inventory
          items={inventoryItems}
          onClose={handleInventoryClose}
          onSelectItem={handleSelectItem}
        />
      )}
    </>
  );
}
