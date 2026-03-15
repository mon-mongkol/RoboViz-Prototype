'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ThreeScene = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- 1. SETUP SCENE ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a1a');

    // --- 2. SETUP CAMERA (Perspective) ---
    const camera = new THREE.PerspectiveCamera(
      75, 
      containerRef.current.clientWidth / containerRef.current.clientHeight, 
      0.1, 
      1000
    );
    // ตั้งค่าตำแหน่งเริ่มต้นให้มองจากมุมบน (Bird's eye view แบบเฉียง)
    camera.position.set(5, 5, 5);

    // --- 3. SETUP RENDERER ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // --- 4. GRID HELPER (อัลกอริทึมการตีเส้น) ---
    // ขนาด 20x20 เมตร, แบ่งเป็น 20 ช่อง (ช่องละ 1 เมตร)
    const size = 20;
    const divisions = 20;
    const gridHelper = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
    
    // สำคัญ: ใน ROS แกน Z คือแนวตั้ง แต่ใน Three.js GridHelper มันนอนบนระนาบ XZ (Y-up)
    // ถ้าคุณต้องการใช้มาตรฐาน ROS (Z-up) ต้องหมุน Grid ให้มานอนที่พื้น XY
    gridHelper.rotation.x = Math.PI / 2; 
    scene.add(gridHelper);

    // เพิ่ม AxesHelper เพื่อดูทิศทาง (X:แดง, Y:เขียว, Z:น้ำเงิน)
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    // --- 5. ORBIT CONTROLS ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // --- 6. ANIMATION LOOP ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update(); // จำเป็นสำหรับ damping
      renderer.render(scene, camera);
    };
    animate();

    // --- 7. RESIZE HANDLING ---
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // CLEANUP
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* UI Overlay (ถ้าอยากวางปุ่มทับบน Layout) */}
      <div className="absolute top-4 left-4 z-10 text-white font-mono text-xs bg-black/50 p-2 rounded">
        THREE.JS RENDERER (NO ROS3DJS)
      </div>
      
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default ThreeScene;