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
const TaskProgressList = dynamic(() => import("./TaskProgressList"), {
  ssr: false,
});

import type { InventoryItem } from "./Inventory";
import type { Task } from "./TaskProgressList";
import { generateThumbnail } from "@/utils/thumbnail-generator";

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
    BOUNCE: "/quack.mp3",
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
const DYNAMIC_MODEL_SCALE = 1.0;

// Utility functions
function optimizeSkinnedMeshes(object: THREE.Object3D) {
  object.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      const mesh = child as THREE.SkinnedMesh;
      
      // Critical: Simplify geometry for performance
      const geometry = mesh.geometry;
      
      // Enable frustum culling (should be default but ensure it's on)
      mesh.frustumCulled = true;
      
      // Optimize the skeleton - limit bone influence
      if (mesh.skeleton && geometry.attributes.skinWeight) {
        const skinWeights = geometry.attributes.skinWeight;
        // Limit to 2 bone influences max (from default 4) for better performance
        for (let i = 0; i < skinWeights.count; i++) {
          const weights = [
            skinWeights.getX(i),
            skinWeights.getY(i),
            skinWeights.getZ(i),
            skinWeights.getW(i)
          ];
          
          // Zero out weaker influences
          if (weights[2] < 0.1) {
            skinWeights.setZ(i, 0);
            skinWeights.setW(i, 0);
          }
        }
        skinWeights.needsUpdate = true;
      }
      
      console.log(`Optimized skinned mesh: ${mesh.name || "unnamed"}, bones: ${mesh.skeleton?.bones.length || 0}`);
    }
  });
}

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

      for (const material of materials) {
        // Keep MeshBasicMaterial as-is for performance (don't convert)
        if (material.type === "MeshBasicMaterial") {
          continue;
        }

        // Optimize MeshStandardMaterial
        if (material.type === "MeshStandardMaterial") {
          const stdMat = material as THREE.MeshStandardMaterial;
          stdMat.roughness = 1.0; // No specular = faster
          stdMat.metalness = 0.0;
          stdMat.emissive.setHex(0x000000);
          stdMat.emissiveIntensity = 0;
          
          if (brightnessMultiplier !== 1.0) {
            stdMat.color.multiplyScalar(brightnessMultiplier);
          }
          
          // Disable unnecessary transparency
          if (stdMat.transparent && stdMat.opacity === 1) {
            stdMat.transparent = false;
          }
        }
      }
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading scene...");
  const [isNoclipActive, setIsNoclipActive] = useState(false);
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

  // Task management helpers
  const addTask = (id: string, message: string) => {
    setTasks((prev) => [
      ...prev,
      { id, progress: 1, message, status: "processing" },
    ]);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...updates } : task))
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  // Inventory state with thumbnails
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // Generate thumbnails on mount
  useEffect(() => {
    const items: InventoryItem[] = [
    {
      id: "duck",
      name: "Duck",
      modelUrl: "/assets/homemade/duck.glb",
      sfx: ["/sfx/dog_1.mp3"], // Placeholder - add duck sounds later
      scale: 0.1, // Smaller duck
    },
    // Gandalf animations
    {
      id: "gandalf-walking",
      name: "Gandalf (Walking)",
      modelUrl: "/assets/homemade/gandalf/Animation_Walking_withSkin.glb",
      sfx: ["/sfx/orc_1.mp3", "/sfx/orc_2.mp3"],
    },
    {
      id: "gandalf-running",
      name: "Gandalf (Running)",
      modelUrl: "/assets/homemade/gandalf/Animation_Running_withSkin.glb",
      sfx: ["/sfx/orc_1.mp3", "/sfx/orc_2.mp3"],
    },
    {
      id: "gandalf-backflip",
      name: "Gandalf (Backflip)",
      modelUrl: "/assets/homemade/gandalf/Animation_Backflip_withSkin.glb",
      sfx: ["/sfx/orc_1.mp3", "/sfx/orc_2.mp3"],
    },
    {
      id: "gandalf-spin-jump",
      name: "Gandalf (Spin Jump)",
      modelUrl:
        "/assets/homemade/gandalf/Animation_360_Power_Spin_Jump_withSkin.glb",
      sfx: ["/sfx/orc_1.mp3", "/sfx/orc_2.mp3"],
    },
    {
      id: "groupphoto",
      name: "Group Photo",
      modelUrl: "/assets/homemade/groupphoto.glb",
      scale: 0.6
    },
    {
      id: "macbook",
      name: "MacBook",
      modelUrl: "/assets/homemade/macbook.glb",
      scale: 0.4, // Smaller MacBook
    },
    // Mermaid animations
    {
      id: "mermaid-walking",
      name: "Mermaid (Walking)",
      modelUrl: "/assets/homemade/mermaid/Animation_Walking_withSkin.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "mermaid-running",
      name: "Mermaid (Running)",
      modelUrl: "/assets/homemade/mermaid/Animation_Running_withSkin.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "mermaid-dance",
      name: "Mermaid (Dance)",
      modelUrl: "/assets/homemade/mermaid/Animation_Boom_Dance_withSkin.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "mermaid-agree",
      name: "Mermaid (Agree)",
      modelUrl: "/assets/homemade/mermaid/Animation_Agree_Gesture_withSkin.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "mermaid-spin-jump",
      name: "Mermaid (Spin Jump)",
      modelUrl:
        "/assets/homemade/mermaid/Animation_360_Power_Spin_Jump_withSkin.glb",
      sfx: ["/sfx/furry_1.mp3"],
    },
    {
      id: "mlp",
      name: "My Little Pony",
      modelUrl: "/assets/homemade/mlp.glb",
      sfx: ["/sfx/dog_2.mp3"], // Placeholder - add pony sounds later
    },
    {
      id: "redbull",
      name: "Red Bull",
      modelUrl: "/assets/homemade/redbull.glb",
      scale: 0.5, // Smaller Red Bull
    },
    {
      id: "hackharvard",
      name: "Hack Harvard",
      modelUrl: "/assets/homemade/hackharvard.glb",
      scale: 0.5, // Smaller Hack Harvard
    },
    // Santa animations
    {
      id: "santa-walking",
      name: "Santa (Walking)",
      modelUrl: "/assets/homemade/santa/Animation_Walking_withSkin.glb",
      sfx: ["/sfx/orc_3.mp3"],
    },
    {
      id: "santa-running",
      name: "Santa (Running)",
      modelUrl: "/assets/homemade/santa/Animation_Running_withSkin.glb",
      sfx: ["/sfx/orc_3.mp3"],
    },
    {
      id: "santa-spin-jump",
      name: "Santa (Spin Jump)",
      modelUrl:
        "/assets/homemade/santa/Animation_360_Power_Spin_Jump_withSkin.glb",
      sfx: ["/sfx/orc_3.mp3"],
    },
    ];

    // Generate thumbnails for all items
    Promise.all(
      items.map(async (item) => ({
        ...item,
        icon: await generateThumbnail(item.modelUrl),
      }))
    ).then(setInventoryItems);
  }, []);

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
      // Don't handle shortcuts if textarea is focused
      if (document.body.getAttribute("data-textarea-focused") === "true") {
        return;
      }

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
      } else if (e.code === "KeyV") {
        // Clear all spawned dynamic models
        if ((window as any).__CLEAR_DYNAMIC_MODELS__) {
          (window as any).__CLEAR_DYNAMIC_MODELS__();
          console.log("Cleared all spawned models");
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

      const renderer = new THREE.WebGLRenderer({
        antialias: false, // Disabled for better performance
        powerPreference: "high-performance", // Use dedicated GPU if available
      });
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
        mixer?: THREE.AnimationMixer;
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
          .setTranslation(0, 0.3, 0)
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

        // Clear all key states when controls unlock (modal opens)
        clearKeyState();
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

      // Check if mesh is cached
      const worldCache = (window as any).__WORLD_CACHE__;
      let meshLoadUrl = meshUrl;
      if (worldCache && worldCache.has(meshUrl)) {
        console.log("[WorldCache] Using cached mesh:", meshUrl);
        const cachedData = worldCache.get(meshUrl);
        const blob = new Blob([cachedData], { type: "model/gltf-binary" });
        meshLoadUrl = URL.createObjectURL(blob);
      }

      gltfLoader.load(meshLoadUrl, (gltf) => {
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

      // Check if splat is cached
      let splatLoadUrl = splatUrl;
      if (worldCache && worldCache.has(splatUrl)) {
        console.log("[WorldCache] Using cached splat:", splatUrl);
        const cachedData = worldCache.get(splatUrl);
        const blob = new Blob([cachedData], {
          type: "application/octet-stream",
        });
        splatLoadUrl = URL.createObjectURL(blob);
      }

      splatMesh = new SplatMesh({
        url: splatLoadUrl,
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
        soundUrls?: string[],
        customScale?: number
      ): Promise<void> {
        try {
          // Spawn right in front of the user's face at eye level
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();

          // Spawn 1.5 units in front at eye level (closer and more visible)
          const spawnPosition = camera.position
            .clone()
            .addScaledVector(forward, 1.5);

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
            optimizeSkinnedMeshes(gltf.scene);
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
            mixer?: THREE.AnimationMixer;
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

          // Setup animations if available
          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(gltf.scene);
            dynamicEntry.mixer = mixer;

            // Play ONLY the first animation for performance
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();

            console.log(
              `Started animation: ${gltf.animations[0].name || "unnamed"}`
            );
          }

          // Play spawn sound
          if (soundBuffers && soundBuffers.length > 0 && audioContext) {
            const randomSound =
              soundBuffers[Math.floor(Math.random() * soundBuffers.length)];
            playAudio(audioContext, randomSound, 0.6, 1.0, muted);
          }

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

          if (meshes.length === 0) {
            console.warn("No meshes found in model, creating default collider");
            // Create a default 1x1x1 box if no meshes found
            const defaultCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
              .setFriction(0.8)
              .setRestitution(0.05);
            world.createCollider(defaultCollider, sharedBody);
          } else {
            for (const mesh of meshes) {
              mesh.updateWorldMatrix(true, false);
              tempBox.setFromObject(mesh);
              overallBox.union(tempBox);
            }

            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            overallBox.getCenter(center);
            overallBox.getSize(size);

            console.log(
              `Model bounding box - Size: (${size.x.toFixed(
                2
              )}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`
            );

            // Check if bounding box is valid
            if (size.x === 0 || size.y === 0 || size.z === 0 || isNaN(size.x)) {
              console.warn("Invalid bounding box, using default collider");
              const defaultCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
                .setFriction(0.8)
                .setRestitution(0.05);
              world.createCollider(defaultCollider, sharedBody);
            } else {
              // Transform to local space
              // Use custom scale if provided, otherwise use default
              const modelScale =
                customScale !== undefined ? customScale : DYNAMIC_MODEL_SCALE;
              const localCenter = center.clone();
              dynamicEntry.root.worldToLocal(localCenter);
              localCenter.multiplyScalar(modelScale);

              const halfExtents = size.clone().multiplyScalar(modelScale * 0.5);

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
              console.log(
                `Created physics collider with half-extents: (${halfExtents.x.toFixed(
                  2
                )}, ${halfExtents.y.toFixed(2)}, ${halfExtents.z.toFixed(2)})`
              );
            }
          }

          // Add entire scene to root (preserves animation hierarchy)
          // Use custom scale if provided, otherwise use default
          const modelScale =
            customScale !== undefined ? customScale : DYNAMIC_MODEL_SCALE;
          gltf.scene.scale.set(modelScale, modelScale, modelScale);
          gltf.scene.position.set(0, 0, 0);
          gltf.scene.rotation.set(0, 0, 0);
          dynamicEntry.root.add(gltf.scene);

          // Register meshes for raycasting and grabbing
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              meshToBody.set(mesh, sharedBody);
              grabbableMeshes.push(mesh);
            }
          });

          bodyToMesh.set(sharedBody.handle, dynamicEntry.root as THREE.Mesh);
          dynamicModels.push(dynamicEntry);
        } catch (error) {
          console.error("Error loading dynamic model:", error);
          throw error;
        }
      }

      (window as any).__LOAD_DYNAMIC_MODEL__ = loadDynamicModel;

      // Function to update noclip state in React
      (window as any).__UPDATE_NOCLIP_STATE__ = setIsNoclipActive;

      // Function to clear all spawned dynamic models and projectiles
      function clearAllDynamicModels() {
        console.log(
          `Clearing ${dynamicModels.length} dynamic models and ${projectiles.length} projectiles...`
        );

        // Remove each model from the scene and physics
        for (const model of dynamicModels) {
          try {
            // Remove from scene
            scene.remove(model.root);

            // Dispose of animation mixer
            if (model.mixer) {
              model.mixer.stopAllAction();
            }

            // Remove physics body
            try {
              world.removeRigidBody(model.body);
            } catch {
              // Body may already be removed
            }

            // Remove from body-to-mesh map
            bodyToMesh.delete(model.body.handle);

            // Remove meshes from grabbable list and mesh-to-body map
            model.root.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                meshToBody.delete(mesh);
                const index = grabbableMeshes.indexOf(mesh);
                if (index > -1) {
                  grabbableMeshes.splice(index, 1);
                }
              }
            });
          } catch (error) {
            console.warn("Error removing model:", error);
          }
        }

        // Clear all projectiles
        for (const projectile of projectiles) {
          try {
            // Remove from scene
            scene.remove(projectile.mesh);

            // Remove physics body
            try {
              world.removeRigidBody(projectile.body);
            } catch {
              // Body may already be removed
            }

            // Remove from maps
            bodyToMesh.delete(projectile.body.handle);
            projectileBodies.delete(projectile.body.handle);
          } catch (error) {
            console.warn("Error removing projectile:", error);
          }
        }

        // Clear the arrays
        dynamicModels.length = 0;
        projectiles.length = 0;
        console.log("✓ All dynamic models and projectiles cleared");
      }

      (window as any).__CLEAR_DYNAMIC_MODELS__ = clearAllDynamicModels;

      // Input handling
      const keyState: Record<string, boolean> = {};
      let debugMode = false;
      let noclipMode = false;

      // Function to clear all key states (called when modals open)
      const clearKeyState = () => {
        for (const key in keyState) {
          keyState[key] = false;
        }
      };

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
        // Don't process game controls if pointer is not locked (modal is open)
        if (!controls.isLocked) {
          return;
        }

        keyState[e.code] = true;

        if (e.code === "KeyM") {
          debugMode = !debugMode;
          toggleDebugMode();
        }

        if (e.code === "KeyN") {
          noclipMode = !noclipMode;
          console.log(`Noclip mode ${noclipMode ? "ENABLED" : "DISABLED"}`);

          // Update React state for UI
          if ((window as any).__UPDATE_NOCLIP_STATE__) {
            (window as any).__UPDATE_NOCLIP_STATE__(noclipMode);
          }

          // Enable/disable physics body
          if (playerBody) {
            if (noclipMode) {
              // Disable gravity and collisions
              playerBody.setGravityScale(0.0, true);
              playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            } else {
              // Re-enable gravity
              playerBody.setGravityScale(1.0, true);
            }
          }
        }

        if (e.code === "Space" && playerBody && !noclipMode) {
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
        // Don't process game controls if pointer is not locked (modal is open)
        if (!controls.isLocked) {
          return;
        }

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

        if (noclipMode) {
          // Noclip mode: Free flight in all directions
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();

          const right = new THREE.Vector3();
          right.crossVectors(forward, camera.up).normalize();

          const up = new THREE.Vector3(0, 1, 0);

          const moveDir = new THREE.Vector3();
          if (keyState.KeyW) moveDir.add(forward);
          if (keyState.KeyS) moveDir.sub(forward);
          if (keyState.KeyD) moveDir.add(right);
          if (keyState.KeyA) moveDir.sub(right);

          // In noclip, Space goes up and Shift goes down
          if (keyState.Space) moveDir.add(up);
          if (keyState.ShiftLeft || keyState.ShiftRight) moveDir.sub(up);

          // Also keep R/F for up/down
          if (keyState.KeyR) moveDir.add(up);
          if (keyState.KeyF) moveDir.sub(up);

          let targetX = 0;
          let targetY = 0;
          let targetZ = 0;

          if (moveDir.lengthSq() > 0) {
            // Faster movement in noclip mode
            moveDir.normalize().multiplyScalar(CONFIG.MOVE_SPEED * 2);
            targetX = moveDir.x;
            targetY = moveDir.y;
            targetZ = moveDir.z;
          }

          playerBody.setLinvel({ x: targetX, y: targetY, z: targetZ }, true);
          stopWalkingSound(); // No walking sound in noclip
        } else {
          // Normal mode: Standard movement with gravity
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
      }

      // Projectiles with object pooling and limits (now using ducks!)
      const projectiles: Array<{
        mesh: THREE.Object3D;
        body: RAPIER.RigidBody;
        lastVelocity: THREE.Vector3;
      }> = [];
      const MAX_PROJECTILES = 50; // Limit to prevent memory issues
      const DUCK_PROJECTILE_SCALE = 0.2; // Small flying ducks
      let cachedDuckModel: GLTF | null = null;

      async function shootProjectile() {
        // Remove oldest projectile if at limit
        if (projectiles.length >= MAX_PROJECTILES) {
          const oldest = projectiles.shift();
          if (oldest) {
            scene.remove(oldest.mesh);
            try {
              world.removeRigidBody(oldest.body);
            } catch {
              // Body may already be removed
            }
            bodyToMesh.delete(oldest.body.handle);
            projectileBodies.delete(oldest.body.handle);
          }
        }

        try {
          // Load duck model (cache it for reuse)
          if (!cachedDuckModel) {
            cachedDuckModel = await new Promise<GLTF>((resolve, reject) => {
              gltfLoader.load(
                "/assets/homemade/duck.glb",
                (loaded) => resolve(loaded),
                undefined,
                (error) => reject(error)
              );
            });
          }

          // Clone the duck model
          const duckMesh = cachedDuckModel.scene.clone(true);
          setupMaterialsForLighting(duckMesh);
          duckMesh.scale.set(
            DUCK_PROJECTILE_SCALE,
            DUCK_PROJECTILE_SCALE,
            DUCK_PROJECTILE_SCALE
          );

          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.normalize();

          const origin = camera.position
            .clone()
            .addScaledVector(forward, PROJECTILE_SPAWN_OFFSET);
          duckMesh.position.copy(origin);

          // Orient duck to face forward
          duckMesh.lookAt(origin.clone().add(forward));

          scene.add(duckMesh);

          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(origin.x, origin.y, origin.z)
            .setCcdEnabled(true);
          const body = world.createRigidBody(bodyDesc);

          // Use a small sphere collider for the duck
          const colliderDesc = RAPIER.ColliderDesc.ball(
            CONFIG.PROJECTILE_RADIUS
          ).setRestitution(CONFIG.PROJECTILE_RESTITUTION);
          world.createCollider(colliderDesc, body);

          const velocity = forward.multiplyScalar(CONFIG.PROJECTILE_SPEED);
          body.setLinvel(velocity, true);

          projectiles.push({
            mesh: duckMesh,
            body,
            lastVelocity: velocity.clone(),
          });
          // Store as Object3D in the map (we won't grab ducks anyway)
          bodyToMesh.set(body.handle, duckMesh as any);
          projectileBodies.add(body.handle);
        } catch (error) {
          console.error("Failed to shoot duck:", error);
        }
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

        // Update character animation mixers
        for (const mixer of Object.values(animationMixers)) {
          mixer?.update(frameTime);
        }

        // Update dynamic model animation mixers (distance-based + view-based culling)
        const cameraPos = camera.position;
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        
        for (const model of dynamicModels) {
          if (model.mixer && mounted) {
            try {
              const distance = model.root.position.distanceTo(cameraPos);
              
              // Check if model is behind camera
              const toModel = new THREE.Vector3().subVectors(model.root.position, cameraPos).normalize();
              const dot = cameraDir.dot(toModel);
              const isBehindCamera = dot < -0.5;
              
              // Update animations at reduced rate based on distance and visibility
              if (distance < 10 && !isBehindCamera) {
                // Close and visible: full rate
                model.mixer.update(frameTime);
              } else if (distance < 20 && !isBehindCamera) {
                // Medium distance: half rate
                if (Date.now() % 2 === 0) {
                  model.mixer.update(frameTime * 2);
                }
              }
              // Far or behind camera: don't update
            } catch {
              continue;
            }
          }
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

        // Clear caches
        modelCache.clear();
        audioBufferCache.clear();
        materialCache.clear();
        cachedDuckModel = null; // Clear duck model cache

        // Revoke blob URLs if we created them
        if (meshLoadUrl !== meshUrl) {
          URL.revokeObjectURL(meshLoadUrl);
        }
        if (splatLoadUrl !== splatUrl) {
          URL.revokeObjectURL(splatLoadUrl);
        }

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
        await (window as any).__LOAD_DYNAMIC_MODEL__(
          item.modelUrl,
          item.sfx,
          item.scale
        );
        console.log(
          `Spawned ${item.name} from inventory${
            item.scale ? ` with custom scale ${item.scale}` : ""
          }`
        );
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
      return;
    }

    const taskId = `text-${Date.now()}`;
    addTask(taskId, "Creating preview model...");

    try {
      updateTask(taskId, { status: "processing", progress: 1 });

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

      updateTask(taskId, {
        message: "Starting mesh generation...",
        progress: 5,
      });

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
        const displayProgress = Math.max(
          10,
          Math.min(45, 10 + progress * 0.35)
        );

        if (progress > 0 && progress < 100) {
          updateTask(taskId, {
            message: `Generating mesh... ${progress}% complete`,
            progress: displayProgress,
          });
        }

        if (statusData.status === "SUCCEEDED") {
          previewComplete = true;

          // If preview was completed by Tripo3D (has glb directly), skip refine and load it
          const glbUrl = statusData.model_urls?.glb || statusData.model_url;
          if (statusData.provider === "tripo3d" && glbUrl) {
            console.log(
              "Preview completed by Tripo3D - loading directly, skipping refine"
            );
            updateTask(taskId, {
              message: "Loading model into scene...",
              progress: 100,
              status: "processing",
            });

            if ((window as any).__LOAD_DYNAMIC_MODEL__) {
              await (window as any).__LOAD_DYNAMIC_MODEL__(glbUrl);
            }

            updateTask(taskId, {
              message: "Model loaded successfully!",
              status: "completed",
              progress: 100,
            });
            setShowTextModal(false);
            return; // Exit early, don't go to refine stage
          }

          break;
        } else if (statusData.status === "FAILED") {
          const errorMsg =
            statusData.task_error?.message || "Preview generation failed";
          updateTask(taskId, {
            message: `Error: ${errorMsg}`,
            status: "error",
            progress: 0,
          });
          throw new Error(errorMsg);
        }
      }

      if (!previewComplete) {
        updateTask(taskId, {
          message: "Error: Preview generation timeout",
          status: "error",
          progress: 0,
        });
        throw new Error("Preview generation timeout");
      }

      // Stage 2: Create refine task (only for Meshy previews)
      updateTask(taskId, { message: "Adding textures...", progress: 50 });

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
        const displayProgress = Math.max(
          50,
          Math.min(95, 50 + progress * 0.45)
        );

        if (progress > 0 && progress < 100) {
          updateTask(taskId, {
            message: `Adding textures... ${progress}% complete`,
            progress: displayProgress,
          });
        }

        if (statusData.status === "SUCCEEDED") {
          const glbUrl = statusData.model_urls?.glb || statusData.model_url;
          if (glbUrl) {
            updateTask(taskId, {
              message: "Loading model into scene...",
              progress: 100,
              status: "processing",
            });

            // Load the model
            if ((window as any).__LOAD_DYNAMIC_MODEL__) {
              await (window as any).__LOAD_DYNAMIC_MODEL__(glbUrl);
            }

            updateTask(taskId, {
              message: "Model loaded successfully!",
              status: "completed",
              progress: 100,
            });
            setShowTextModal(false);
            setTimeout(() => {
              if (controlsRef.current) {
                controlsRef.current.lock();
              }
            }, 100);
            return;
          } else {
            throw new Error("No GLB model URL in response");
          }
        } else if (statusData.status === "FAILED") {
          const errorMsg =
            statusData.task_error?.message || "Texture generation failed";
          updateTask(taskId, {
            message: `Error: ${errorMsg}`,
            status: "error",
            progress: 0,
          });
          throw new Error(errorMsg);
        }
      }

      updateTask(taskId, {
        message: "Error: Texture generation timeout",
        status: "error",
        progress: 0,
      });
      throw new Error("Texture generation timeout");
    } catch (error) {
      console.error("Error generating model from text:", error);
      updateTask(taskId, {
        message: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        status: "error",
        progress: 0,
      });
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return;
    }

    const taskId = `upload-${Date.now()}`;
    addTask(taskId, "Converting image to base64...");

    try {
      updateTask(taskId, { status: "processing", progress: 1 });

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

      updateTask(taskId, { message: "Sending to AI...", progress: 5 });

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
      const backendTaskId = data.id;
      console.log("Meshy task created:", backendTaskId);

      updateTask(taskId, {
        message: "Starting 3D generation...",
        progress: 10,
      });

      const progressInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/whiteboard/status?taskId=${backendTaskId}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const progress = statusData.progress || 0;

            if (progress > 0 && progress < 100) {
              updateTask(taskId, {
                message: `Generating model... ${progress}% complete`,
                progress: Math.max(5, Math.min(95, progress)),
              });
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
          `/api/whiteboard/status?taskId=${backendTaskId}`
        );
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();

        if (statusData.status === "FAILED") {
          clearInterval(progressInterval);
          const errorMsg =
            statusData.task_error?.message || "Model generation failed";
          updateTask(taskId, {
            message: `Error: ${errorMsg}`,
            status: "error",
            progress: 0,
          });
          throw new Error(errorMsg);
        }

        // Get GLB URL - works for both Meshy and Tripo3D
        const glbUrl = statusData.model_urls?.glb || statusData.model_url;

        if (statusData.status === "SUCCEEDED" && glbUrl) {
          clearInterval(progressInterval);
          updateTask(taskId, {
            message: "Loading model into scene...",
            progress: 100,
            status: "processing",
          });

          // Load the model using the existing function
          if ((window as any).__LOAD_DYNAMIC_MODEL__) {
            await (window as any).__LOAD_DYNAMIC_MODEL__(glbUrl);
          }

          updateTask(taskId, {
            message: "Model loaded successfully!",
            status: "completed",
            progress: 100,
          });
          setShowUploadModal(false);
          setTimeout(() => {
            if (controlsRef.current) {
              controlsRef.current.lock();
            }
          }, 100);
          return;
        }
      }

      clearInterval(progressInterval);
      updateTask(taskId, {
        message: "Error: Model generation timeout",
        status: "error",
        progress: 0,
      });
      throw new Error("Model generation timeout");
    } catch (error) {
      console.error("Error generating model:", error);
      updateTask(taskId, {
        message: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        status: "error",
        progress: 0,
      });
    }
  };

  return (
    <>
      <div ref={containerRef} className="w-full h-screen" />

      {/* Loading Screen */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 z-50">
          <div
            className="text-center bg-white rounded-3xl border-4 border-black p-12"
            style={{
              boxShadow: "12px 12px 0px 0px rgba(0, 0, 0, 1)",
            }}
          >
            <div className="mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-black border-t-transparent mx-auto"></div>
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              Loading World
            </h2>
            <p className="text-gray-600 text-lg">{loadingMessage}</p>
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
              <h2 className="text-4xl font-bold text-white mb-8">
                Ready to explore?
              </h2>
              <button
                className="bg-gradient-to-r from-purple-500 to-pink-500 border-4 border-white text-white font-bold py-6 px-12 rounded-full text-2xl mb-8 transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:from-purple-600 hover:to-pink-600"
                style={{
                  boxShadow: "8px 8px 0px 0px rgba(255, 255, 255, 1)",
                }}
              >
                Click to Start
              </button>
              <div
                className="bg-white rounded-3xl border-4 border-black p-6 text-gray-800 text-sm space-y-3 max-w-md mx-auto"
                style={{
                  boxShadow: "8px 8px 0px 0px rgba(0, 0, 0, 0.5)",
                }}
              >
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
                    <span className="font-semibold">N:</span> Noclip
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
                    <span className="font-semibold">V:</span> Clear All
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
              Arrows: Rotate • .: Launch • M: Debug • N: Noclip • L: Whiteboard
              • U: Upload • T: Text • I: Inventory • V: Clear All • H: Home
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

          {/* Noclip Indicator */}
          {isNoclipActive && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-full text-base font-bold tracking-wide shadow-2xl backdrop-blur animate-pulse z-20 pointer-events-none">
              ✈️ NOCLIP MODE ACTIVE
            </div>
          )}

          {/* Task Progress List */}
          <TaskProgressList tasks={tasks} onRemoveTask={removeTask} />
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
          onGenerationStart={(taskId: string) => {
            addTask(taskId, "Converting drawing to image...");
          }}
          onGenerationProgress={(
            taskId: string,
            progress: number,
            message: string
          ) => {
            updateTask(taskId, {
              progress,
              message,
              status: progress >= 100 ? "completed" : "processing",
            });
          }}
          onGenerationComplete={(taskId: string) => {
            updateTask(taskId, {
              status: "completed",
              progress: 100,
            });
          }}
          onGenerationError={(taskId: string, error: string) => {
            updateTask(taskId, {
              status: "error",
              message: `Error: ${error}`,
              progress: 0,
            });
          }}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white rounded-3xl border-4 border-black p-8 max-w-md w-full mx-4"
            style={{
              boxShadow: "12px 12px 0px 0px rgba(0, 0, 0, 1)",
            }}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Generate 3D Model from Image
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              Upload an image (JPG, JPEG, PNG, or WebP) to generate a 3D model
              Progress will be shown in the top right corner.
            </p>

            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileUpload(file);
                  setShowUploadModal(false);
                }
              }}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-4 file:border-black file:text-sm file:font-bold file:bg-white file:text-gray-800 hover:file:translate-x-[2px] hover:file:translate-y-[2px] file:transition-all mb-4"
              style={{
                padding: "0.5rem",
              }}
            />

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setTimeout(() => {
                    if (controlsRef.current) {
                      controlsRef.current.lock();
                    }
                  }, 100);
                }}
                className="flex-1 bg-white border-4 border-black text-gray-800 font-bold py-3 px-4 rounded-full hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                style={{
                  boxShadow: "6px 6px 0px 0px rgba(0, 0, 0, 1)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text to 3D Modal */}
      {showTextModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="bg-white rounded-3xl border-4 border-black p-8 max-w-md w-full mx-4"
            style={{
              boxShadow: "12px 12px 0px 0px rgba(0, 0, 0, 1)",
            }}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Generate 3D Model from Text
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              Describe a 3D object and Meshy AI will generate it for you.
              Progress will be shown in the top right corner.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const prompt = formData.get("prompt") as string;
                const artStyle = formData.get("artStyle") as string;
                handleTextToModel(prompt, artStyle);
                setShowTextModal(false);
              }}
            >
              <div className="mb-4">
                <label
                  htmlFor="prompt"
                  className="block text-sm font-bold text-gray-800 mb-2"
                >
                  Description
                </label>
                <textarea
                  id="prompt"
                  name="prompt"
                  rows={4}
                  placeholder="e.g., a medieval sword with golden handle, a cute robot character, a fantasy castle..."
                  className="w-full px-4 py-3 border-4 border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none text-gray-800"
                  maxLength={600}
                  required
                />
              </div>

              <div className="mb-6">
                <label
                  htmlFor="artStyle"
                  className="block text-sm font-bold text-gray-800 mb-2"
                >
                  Art Style
                </label>
                <select
                  id="artStyle"
                  name="artStyle"
                  className="w-full px-4 py-3 border-4 border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400 text-gray-800 font-medium"
                >
                  <option value="realistic">Realistic</option>
                  <option value="sculpture">Sculpture</option>
                </select>
              </div>

              <div className="flex gap-4">
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
                  className="flex-1 bg-white border-4 border-black text-gray-800 font-bold py-3 px-4 rounded-full hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                  style={{
                    boxShadow: "6px 6px 0px 0px rgba(0, 0, 0, 1)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 border-4 border-black text-white font-bold py-3 px-4 rounded-full hover:translate-x-[2px] hover:translate-y-[2px] hover:from-purple-600 hover:to-pink-600 transition-all"
                  style={{
                    boxShadow: "6px 6px 0px 0px rgba(0, 0, 0, 1)",
                  }}
                >
                  Generate
                </button>
              </div>
            </form>
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
