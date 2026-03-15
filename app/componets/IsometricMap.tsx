'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ROSLIB from 'roslib';
import { useROS } from '@/app/context/ROSContext';
import {useRobotPose } from '@/app/hooks/RobotPose_Slam';
import { getRobotDimensions, RobotDimensions, scaleRobotDimensions, calculateOptimalScale } from '@/app/utils/urdfParser';

interface OccupancyGridMessage {
  info: {
    width: number;
    height: number;
    resolution: number;
    origin: {
      position: { x: number; y: number; z: number };
      orientation: { x: number; y: number; z: number; w: number };
    };
  };
  data: number[];
}

const IsometricMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const voxelGroupRef = useRef<THREE.Group | null>(null);
  const robotMeshRef = useRef<THREE.Mesh | null>(null);
  const topicRef = useRef<ROSLIB.Topic | null>(null);
  const materialsRef = useRef<{ free: THREE.Material; occupied: THREE.Material } | null>(null);
  const robotMaterialRef = useRef<THREE.Material | null>(null);
  const texturesLoadedRef = useRef(false);
  const robotDimensionsRef = useRef<RobotDimensions | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [robotInfo, setRobotInfo] = useState<{ name: string; pose: { x: number; y: number; z: number; yaw: number } | null } | null>(null);
  const [mapResolution, setMapResolution] = useState<number>(0.05); // Default map resolution
  const [scaleFactor, setScaleFactor] = useState<number>(1.0); // Scale factor for visual adjustment

  const { ros, connected } = useROS();
  const { robotPose, error } = useRobotPose({ 
    ros: ros || null, 
    connected: connected || false 
  });

  // Load textures ONCE
  const loadTexturesOnce = async (): Promise<{
    free: THREE.Texture;
    occupied: THREE.Texture;
  }> => {
    if (texturesLoadedRef.current && materialsRef.current) {
      return {
        free: (materialsRef.current.free as THREE.MeshPhongMaterial).map!,
        occupied: (materialsRef.current.occupied as THREE.MeshPhongMaterial).map!,
      };
    }

    const textureLoader = new THREE.TextureLoader();

    const dirtTexture = await textureLoader.loadAsync('dirt.png');
    dirtTexture.magFilter = THREE.NearestFilter;
    dirtTexture.minFilter = THREE.NearestFilter;

    const cobblestoneTexture = await textureLoader.loadAsync('cobblestone.png');
    cobblestoneTexture.magFilter = THREE.NearestFilter;
    cobblestoneTexture.minFilter = THREE.NearestFilter;

    // Load robot texture
    const robotTexture = await textureLoader.loadAsync('globe.svg');
    robotTexture.magFilter = THREE.LinearFilter;
    robotTexture.minFilter = THREE.LinearFilter;

    // Create materials ONCE
    const floorMaterial = new THREE.MeshPhongMaterial({
      map: dirtTexture,
      shininess: 100,
    });

    const wallMaterial = new THREE.MeshPhongMaterial({
      map: cobblestoneTexture,
      shininess: 100,
    });

    const robotMaterial = new THREE.MeshPhongMaterial({
      map: robotTexture,
      shininess: 50,
      emissive: 0x3333ff,
    });

    materialsRef.current = {
      free: floorMaterial,
      occupied: wallMaterial,
    };

    robotMaterialRef.current = robotMaterial;
    texturesLoadedRef.current = true;

    return {
      free: dirtTexture,
      occupied: cobblestoneTexture,
    };
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Load robot dimensions from URDF (default to TurtleBot3 Burger)
    const robotDims = getRobotDimensions('turtlebot3_burger');
    robotDimensionsRef.current = robotDims;
    setRobotInfo({ name: robotDims.robotName, pose: null });

    // --- 1. SETUP SCENE ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    //scene.fog = new THREE.Fog(0x87ceeb, 500, 1000); // Add fog for culling distant objects

    // --- 2. SETUP CAMERA (Orthographic for isometric view) ---
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      10000
    );
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // --- 3. SETUP RENDERER (Optimized for old devices) ---
    const renderer = new THREE.WebGLRenderer({ 
      antialias: false, // Disable antialiasing for better performance
      precision: 'lowp', // Use low precision for older devices
      alpha: false, // Disable alpha channel
      stencil: false, // Disable stencil buffer
      depth: true, // Keep depth buffer for sorting
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio
    renderer.sortObjects = true; // Enable sorting to reduce overdraw
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- 4. LIGHTING (Optimized) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Slightly reduced intensity
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = false; // Disable shadow casting for performance
    directionalLight.shadow.mapSize.width = 512; // Reduce shadow map size
    directionalLight.shadow.mapSize.height = 512;
    scene.add(directionalLight);

    // --- 5. CREATE VOXEL GROUP ---
    const voxelGroup = new THREE.Group();
    scene.add(voxelGroup);
    voxelGroupRef.current = voxelGroup;

    // --- 6. GRID HELPER (Optional - can be toggled) ---
    const gridHelper = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3; // Make it less prominent
    scene.add(gridHelper);

    // --- 7. AXES HELPER (Optional - can be toggled) ---
    const axesHelper = new THREE.AxesHelper(10);
    axesHelper.visible = false; // Hide by default to improve performance
    scene.add(axesHelper);

    // --- 8. ORBIT CONTROLS (Optimized) ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08; // Increased damping for smoother interaction
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.autoRotateSpeed = 0; // Ensure no auto-rotation

    // --- 9. ANIMATION LOOP ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- 10. RESIZE HANDLING ---
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

  // Update robot pose on the map
  const updateRobotPose = (pose: { x: number; y: number; z: number; yaw: number }) => {
    if (!sceneRef.current || !robotMaterialRef.current || !robotDimensionsRef.current) return;

    let dims = robotDimensionsRef.current;

    // Apply scale factor for Gazebo compatibility
    if (scaleFactor !== 1.0) {
      dims = scaleRobotDimensions(dims, scaleFactor);
    }

    // Remove old robot mesh if it exists
    if (robotMeshRef.current) {
      sceneRef.current.remove(robotMeshRef.current);
      if (robotMeshRef.current.geometry) {
        robotMeshRef.current.geometry.dispose();
      }
    }

    // Create robot body using URDF dimensions (with scale applied)
    const robotGeometry = new THREE.CylinderGeometry(dims.bodyRadius, dims.bodyRadius, dims.bodyHeight, 32);
    const robotMesh = new THREE.Mesh(robotGeometry, robotMaterialRef.current);

    // Set position from robotPose
    robotMesh.position.set(pose.x, dims.bodyHeight / 2, pose.y);
    robotMesh.rotation.y = pose.yaw; // Apply yaw rotation

    // Add left wheel
    const leftWheelGeometry = new THREE.CylinderGeometry(dims.wheelRadius, dims.wheelRadius, dims.wheelThickness, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    
    const leftWheel = new THREE.Mesh(leftWheelGeometry, wheelMaterial);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(-dims.bodyRadius - 0.01, dims.wheelRadius, 0);
    robotMesh.add(leftWheel);

    // Add right wheel
    const rightWheel = new THREE.Mesh(leftWheelGeometry, wheelMaterial);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(dims.bodyRadius + 0.01, dims.wheelRadius, 0);
    robotMesh.add(rightWheel);

    // Add caster wheel (front)
    const casterRadius = dims.wheelRadius * 0.25;
    const casterGeometry = new THREE.SphereGeometry(casterRadius, 16, 16);
    const casterMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    
    const casterWheel = new THREE.Mesh(casterGeometry, casterMaterial);
    casterWheel.position.set(0, casterRadius, dims.bodyRadius - 0.02);
    robotMesh.add(casterWheel);

    // Add a direction indicator (arrow pointing forward)
    const arrowRadius = dims.bodyRadius * 0.6;
    const arrowHeight = dims.bodyHeight * 0.6;
    const arrowGeometry = new THREE.ConeGeometry(arrowRadius, arrowHeight, 8);
    const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000 });
    const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrowMesh.position.set(0, dims.bodyHeight / 2, dims.bodyRadius + 0.05);
    robotMesh.add(arrowMesh);

    sceneRef.current.add(robotMesh);
    robotMeshRef.current = robotMesh;

    // Update robot info display
    setRobotInfo({
      name: robotDimensionsRef.current.robotName,
      pose: pose,
    });
  };

  // Render occupancy grid as voxels (OPTIMIZED)
  const renderOccupancyGrid = async (message: OccupancyGridMessage) => {
    if (!sceneRef.current || !voxelGroupRef.current) return;

    try {
      // Clear previous voxels
      while (voxelGroupRef.current.children.length > 0) {
        const child = voxelGroupRef.current.children[0];
        voxelGroupRef.current.remove(child);
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          // Don't dispose materials - they're reused!
        }
      }

      // Load textures/materials only once
      await loadTexturesOnce();

      const { data } = message;
      const { width, height, resolution, origin } = message.info;

      // Update map resolution for scale calculation
      setMapResolution(resolution);

      // Calculate optimal scale
      if (robotDimensionsRef.current) {
        const optimalScale = calculateOptimalScale(resolution, robotDimensionsRef.current);
        setScaleFactor(optimalScale);
      }

      // Reuse materials from cache
      const floorMaterial = materialsRef.current!.free;
      const wallMaterial = materialsRef.current!.occupied;

      const cellSize = resolution;
      const floorThickness = cellSize * 0.2;
      const wallHeight = cellSize * 3;

      // Create geometries ONCE and reuse
      const floorGeometry = new THREE.BoxGeometry(cellSize, floorThickness, cellSize);
      const wallGeometry = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);

      // Use InstancedMesh for massive performance boost on large maps
      const freeCount = data.filter(v => v >= 0 && v <= 50).length;
      const occupiedCount = data.filter(v => v > 50).length;

      let freeIndex = 0;
      let occupiedIndex = 0;

      if (freeCount > 0) {
        const floorMesh = new THREE.InstancedMesh(floorGeometry, floorMaterial, freeCount);
        const matrix = new THREE.Matrix4();

        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            const index = col + row * width;
            const value = data[index];

            if (value >= 0 && value <= 50) {
              const x = col * cellSize + origin.position.x;
              const y = row * cellSize + origin.position.y;
              matrix.setPosition(x, floorThickness / 2, y);
              floorMesh.setMatrixAt(freeIndex, matrix);
              freeIndex++;
            }
          }
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        voxelGroupRef.current!.add(floorMesh);
      }

      if (occupiedCount > 0) {
        const wallMesh = new THREE.InstancedMesh(wallGeometry, wallMaterial, occupiedCount);
        const matrix = new THREE.Matrix4();

        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            const index = col + row * width;
            const value = data[index];

            if (value > 50) {
              const x = col * cellSize + origin.position.x;
              const y = row * cellSize + origin.position.y;
              matrix.setPosition(x, wallHeight / 2, y);
              wallMesh.setMatrixAt(occupiedIndex, matrix);
              occupiedIndex++;
            }
          }
        }
        wallMesh.instanceMatrix.needsUpdate = true;
        voxelGroupRef.current!.add(wallMesh);
      }

      setMapLoaded(true);
    } catch (error) {
      console.error('Error rendering occupancy grid:', error);
    }
  };

  // Subscribe to ROS map topic
  useEffect(() => {
    if (!ros || !connected || topicRef.current) {
      setConnectionStatus(connected ? 'Connected' : 'Disconnected');
      return;
    }

    try {
      setConnectionStatus('Subscribing to /map...');

      topicRef.current = new ROSLIB.Topic({
        ros,
        name: '/map',
        messageType: 'nav_msgs/OccupancyGrid',
        compression: 'png',
      });

      topicRef.current.subscribe((message: any) => {
        // console.log('Received map data:', message);

        const occupancyMessage: OccupancyGridMessage = {
          info: {
            width: message.info.width,
            height: message.info.height,
            resolution: message.info.resolution,
            origin: message.info.origin,
          },
          data: message.data,
        };

        renderOccupancyGrid(occupancyMessage);
        setConnectionStatus('Map loaded');
      });

      console.log('Subscribed to /map topic');
      setConnectionStatus('Connected - waiting for map data');
    } catch (error) {
      console.error('Error subscribing to map topic:', error);
      setConnectionStatus('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    return () => {
      if (topicRef.current) {
        topicRef.current.unsubscribe();
        topicRef.current = null;
      }
    };
  }, [ros, connected, robotPose , error]);

  // Update robot pose when it changes
  useEffect(() => {
    if (robotPose && sceneRef.current) {
      updateRobotPose(robotPose);
    }
  }, [robotPose]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400">
      <div className="absolute top-4 left-4 z-10 text-white font-mono text-xs bg-black/50 p-3 rounded space-y-2 max-w-xs">
        <div className="font-bold">🤖 ROS 2D MAP VIEWER</div>
        <div className="text-xs">
          Status: <span className="text-yellow-300">{connectionStatus}</span>
        </div>
        <div className="text-xs">
          Map Loaded: <span className={mapLoaded ? 'text-green-400' : 'text-red-400'}>
            {mapLoaded ? 'Yes' : 'No'}
          </span>
        </div>

        {/* Robot Information */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <div className="font-bold text-blue-300 mb-1">📋 Robot Info</div>
          <div className="text-xs">Model: {robotInfo?.name || 'Loading...'}</div>
        </div>

        {/* Robot Dimensions from URDF */}
        {robotDimensionsRef.current && (
          <div className="text-xs mt-2 border-t border-gray-600 pt-2">
            <div className="font-bold text-cyan-300 mb-1">📐 Dimensions (URDF)</div>
            <div>Body Radius: {robotDimensionsRef.current.bodyRadius.toFixed(3)}m</div>
            <div>Body Height: {robotDimensionsRef.current.bodyHeight.toFixed(3)}m</div>
            <div>Wheel Radius: {robotDimensionsRef.current.wheelRadius.toFixed(3)}m</div>
            <div>Wheel Base: {robotDimensionsRef.current.wheelBase.toFixed(3)}m</div>
            <div className={`mt-1 ${scaleFactor !== 1.0 ? 'text-orange-300' : 'text-gray-400'}`}>
              🔧 Scale: {scaleFactor.toFixed(2)}x
              {scaleFactor !== 1.0 && <span className="text-xs"> (Gazebo adjusted)</span>}
            </div>
          </div>
        )}

        {/* Map Information */}
        {mapLoaded && (
          <div className="text-xs mt-2 border-t border-gray-600 pt-2">
            <div className="font-bold text-purple-300 mb-1">🗺️ Map Info</div>
            <div>Resolution: {(mapResolution * 100).toFixed(1)}cm/px</div>
            <div className="text-xs text-gray-400">
              ({mapResolution.toFixed(4)}m/px)
            </div>
          </div>
        )}

        {/* Robot Pose */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <div className="font-bold text-green-300 mb-1">📍 Robot Pose</div>
          {robotInfo?.pose ? (
            <>
              <div>X: {robotInfo.pose.x.toFixed(3)} m</div>
              <div>Y: {robotInfo.pose.y.toFixed(3)} m</div>
              <div>Z: {robotInfo.pose.z.toFixed(3)} m</div>
              <div>Yaw: {robotInfo.pose.yaw.toFixed(3)} rad</div>
            </>
          ) : (
            <div className="text-gray-400">Waiting for pose data...</div>
          )}
        </div>

        {/* Legend */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <div className="font-bold mb-1">🎨 Legend</div>
          <div>🔵 Blue (textured): Robot</div>
          <div>🟩 Green: Free (dirt)</div>
          <div>⬛ Black: Occupied (cobblestone)</div>
        </div>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default IsometricMap;