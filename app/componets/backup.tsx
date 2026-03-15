'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface VoxelData {
  x: number;
  y: number;
  z: number;
  type: number; // 1 = dirt, 2 = cobblestone
}

const IsometricMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- 1. SETUP SCENE ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // --- 2. SETUP CAMERA (Orthographic for isometric view) ---
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.OrthographicCamera(
      width / -2, width / 2, height / 2, height / -2, 0.1, 1000
    );
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    // --- 3. SETUP RENDERER ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // --- 4. LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(15, 15, 15);
    scene.add(directionalLight);

    // --- 5. GRID HELPER ---
    const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    scene.add(gridHelper);

    // --- 6. AXES HELPER ---
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // --- 7. TEXTURE SETUP ---
    const textureLoader = new THREE.TextureLoader();
    const dirtTexture = textureLoader.load('dirt.png');
    const cobblestoneTexture = textureLoader.load('cobblestone.png');

    dirtTexture.magFilter = THREE.NearestFilter;
    dirtTexture.minFilter = THREE.NearestFilter;
    cobblestoneTexture.magFilter = THREE.NearestFilter;
    cobblestoneTexture.minFilter = THREE.NearestFilter;

    // --- 8. MATERIALS ---
    const dirtMaterial = new THREE.MeshPhongMaterial({ map: dirtTexture });
    const cobblestoneMaterial = new THREE.MeshPhongMaterial({ map: cobblestoneTexture });

    // --- 9. CREATE VOXEL TERRAIN ---
    const voxelSize = 1;
    const chunkSize = 16;
    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

    // Ground (dirt layer)
    for (let x = 0; x < chunkSize; x++) {
      for (let z = 0; z < chunkSize; z++) {
        const mesh = new THREE.Mesh(geometry, dirtMaterial.clone());
        mesh.position.set(x, 0, z);
        scene.add(mesh);
      }
    }

    // Walls (cobblestone)
    const wallHeight = 4;
    for (let x = 0; x < chunkSize; x++) {
      for (let z = 0; z < chunkSize; z++) {
        for (let y = 1; y <= wallHeight; y++) {
          if (x === 0 || x === chunkSize - 1 || z === 0 || z === chunkSize - 1) {
            const mesh = new THREE.Mesh(geometry, cobblestoneMaterial.clone());
            mesh.position.set(x, y, z);
            scene.add(mesh);
          }
        }
      }
    }

    // --- 10. ORBIT CONTROLS ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;

    // --- 11. ANIMATION LOOP ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- 12. RESIZE HANDLING ---
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      camera.left = newWidth / -2;
      camera.right = newWidth / 2;
      camera.top = newHeight / 2;
      camera.bottom = newHeight / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // CLEANUP
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400">
      <div className="absolute top-4 left-4 z-10 text-white font-mono text-xs bg-black/50 p-2 rounded">
        ISOMETRIC MAP VIEWER
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default IsometricMap;