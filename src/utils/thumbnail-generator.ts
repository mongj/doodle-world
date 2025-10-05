import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function generateThumbnail(
  modelUrl: string,
  size = 128
): Promise<string> {
  // Create offscreen renderer
  const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    antialias: true,
    preserveDrawingBuffer: true 
  });
  renderer.setSize(size, size);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

  try {
    // Load model
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(modelUrl);
    const model = gltf.scene;

    // Center and scale model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size3 = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size3.x, size3.y, size3.z);

    model.position.sub(center);
    model.scale.multiplyScalar(1.2 / maxDim); // Scale to fit
    scene.add(model);

    // Position camera
    camera.position.set(1.2, 0.8, 1.2);
    camera.lookAt(0, 0, 0);

    // Add lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(2, 2, 2);
    scene.add(light);

    // Render and get data URL
    renderer.render(scene, camera);
    const thumbnail = renderer.domElement.toDataURL("image/png");

    // Cleanup
    renderer.dispose();
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    return thumbnail;
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${modelUrl}:`, error);
    renderer.dispose();
    return ""; // Return empty string on error
  }
}

