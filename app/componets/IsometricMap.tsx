'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const cameraAdjustedRef = useRef(false); // Track if camera was already adjusted to map
  const controlsRef = useRef<OrbitControls | null>(null);
  const goalArrowRef = useRef<THREE.Group | null>(null);
  const goalMarkerRef = useRef<THREE.Group | null>(null);
  const dragStartRef = useRef<THREE.Vector3 | null>(null);
  const cursorMarkerRef = useRef<THREE.Group | null>(null);
  const globalPlanLineRef = useRef<THREE.Line | null>(null);
  const localPlanLineRef = useRef<THREE.Line | null>(null);
  const globalPlanArrowsRef = useRef<THREE.Group | null>(null);
  const localPlanArrowsRef = useRef<THREE.Group | null>(null);
  const globalPlanTopicRef = useRef<ROSLIB.Topic | null>(null);
  const localPlanTopicRef = useRef<ROSLIB.Topic | null>(null);
  const laserPointsRef = useRef<THREE.Group | null>(null);
  const laserTopicRef = useRef<ROSLIB.Topic | null>(null);
  const robotPoseRef = useRef<{ x: number; y: number; z: number; yaw: number } | null>(null);
  const costmapMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const costmapTopicRef = useRef<ROSLIB.Topic | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [robotInfo, setRobotInfo] = useState<{ name: string; pose: { x: number; y: number; z: number; yaw: number } | null } | null>(null);
  const [mapResolution, setMapResolution] = useState<number>(0.05);
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [goToPointMode, setGoToPointMode] = useState(false);
  const [goalStatus, setGoalStatus] = useState<string>('');
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);
  const [showGlobalPlan, setShowGlobalPlan] = useState(true);
  const [showLocalPlan, setShowLocalPlan] = useState(true);
  const [showLaserScan, setShowLaserScan] = useState(true);
  const [showCostmap, setShowCostmap] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [showRobot, setShowRobot] = useState(true);

  const [showPanel, setShowPanel] = useState(true);
  const [setInitialPoseMode, setSetInitialPoseMode] = useState(false);
  const [initialPoseStatus, setInitialPoseStatus] = useState<string>('');
  const [amclPose, setAmclPose] = useState<{ x: number; y: number; yaw: number } | null>(null);

  // Collapsible panel sections
  const [panelOpen, setPanelOpen] = useState({
    robotInfo: true,
    dimensions: false,
    mapInfo: false,
    pose: false,
    visibility: true,
    navigation: true,
    initialPose: true,
  });
  const togglePanel = (key: keyof typeof panelOpen) =>
    setPanelOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const goToPointModeRef = useRef(false);
  const setInitialPoseModeRef = useRef(false);
  const initialPoseDragStartRef = useRef<THREE.Vector3 | null>(null);
  const initialPoseArrowRef = useRef<THREE.Group | null>(null);
  const initialPoseMarkerRef = useRef<THREE.Group | null>(null);
  const amclPoseTopicRef = useRef<ROSLIB.Topic | null>(null);
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const connectedRef = useRef(false);
  const gridHelperRef = useRef<THREE.Group | null>(null);
  const mapInfoRef = useRef<{ widthMeters: number; heightMeters: number; originX: number; originY: number; resolution: number } | null>(null);
  const odomToMapRef = useRef<{ tx: number; ty: number; yaw: number } | null>(null);

  const { ros, connected } = useROS();
  const { robotPose, error } = useRobotPose({ 
    ros: ros || null, 
    connected: connected || false 
  });

  // Keep refs in sync so event handlers always have latest values
  useEffect(() => {
    rosRef.current = ros;
    connectedRef.current = connected;
  }, [ros, connected]);

  useEffect(() => {
    robotPoseRef.current = robotPose;
  }, [robotPose]);

  // Subscribe to odom→map transform so we can convert local_plan (odom frame) to map frame
  useEffect(() => {
    if (!ros || !connected) return;

    const tfClient = new ROSLIB.TFClient({
      ros,
      fixedFrame: 'map',
      angularThres: 0.01,
      transThres: 0.01,
      rate: 10,
    });

    tfClient.subscribe('odom', (tf) => {
      const q = tf.rotation;
      const yaw = Math.atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z)
      );
      odomToMapRef.current = {
        tx: tf.translation.x,
        ty: tf.translation.y,
        yaw,
      };
    });

    return () => {
      tfClient.unsubscribe('odom');
    };
  }, [ros, connected]);

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

    // Use world-unit (meters) based frustum so we can zoom relative to map size
    const initialViewSize = 10; // meters
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera(
      -initialViewSize * aspect / 2,
      initialViewSize * aspect / 2,
      initialViewSize / 2,
      -initialViewSize / 2,
      0.1,
      10000
    );
    camera.position.set(initialViewSize, initialViewSize * 0.9, initialViewSize);
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

    // --- 6. GRID HELPER (will be replaced with map-aligned grid when map loads) ---
    // Placeholder grid — will be removed and replaced by createMapGrid()
    const placeholderGrid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    placeholderGrid.material.transparent = true;
    placeholderGrid.material.opacity = 0.3;
    placeholderGrid.name = 'placeholderGrid';
    scene.add(placeholderGrid);

    // --- 7. AXES HELPER (Optional - can be toggled) ---
    const axesHelper = new THREE.AxesHelper(10);
    axesHelper.visible = false; // Hide by default to improve performance
    scene.add(axesHelper);

    // --- 8. ORBIT CONTROLS (Optimized) ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true; // pan up/down in screen space (not along ground plane)
    controls.autoRotateSpeed = 0;
    // Left click = rotate, Right click = pan, Scroll = zoom
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    // Touch: one finger = rotate, two fingers = pan/zoom
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    // --- 9. ANIMATION LOOP ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- 10. GOTOPOINT MOUSE HANDLERS ---
    const handleGoToMouseDown = (event: MouseEvent) => {
      if (setInitialPoseModeRef.current) return; // Don't handle if in initial pose mode
      if (!goToPointModeRef.current || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const intersection = getFloorIntersection(event);
      if (intersection) {
        dragStartRef.current = intersection.clone();
        createGoalMarker(intersection);
      }
    };

    const handleGoToMouseMove = (event: MouseEvent) => {
      if (setInitialPoseModeRef.current) return; // Don't handle if in initial pose mode
      if (!goToPointModeRef.current) {
        hideCursorMarker();
        return;
      }

      // Always show coordinates and cursor when in GoToPoint mode (hover or drag)
      const intersection = getFloorIntersection(event);
      if (intersection) {
        setMouseWorldPos({ x: intersection.x, y: intersection.z });
        updateCursorMarker(intersection);
      }

      if (!dragStartRef.current) return;
      event.preventDefault();

      if (intersection) {
        updateGoalArrow(dragStartRef.current, intersection);
      }
    };

    const handleGoToMouseUp = (event: MouseEvent) => {
      if (setInitialPoseModeRef.current) return; // Don't handle if in initial pose mode
      if (!goToPointModeRef.current || !dragStartRef.current || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const endPos = getFloorIntersection(event);
      const startPos = dragStartRef.current;

      if (startPos && endPos) {
        // Calculate ROS yaw from drag direction
        // Three.js scene: X = ROS X, Z = ROS Y
        // ROS yaw = atan2(ROS_dy, ROS_dx) = atan2(dz, dx)
        const dx = endPos.x - startPos.x;
        const dz = endPos.z - startPos.z;
        let yaw = 0;

        if (Math.sqrt(dx * dx + dz * dz) > 0.05) {
          yaw = Math.atan2(dz, dx);
        }

        sendNavigationGoal(startPos, yaw);
      }

      dragStartRef.current = null;

      // Remove arrow after short delay so user can see it
      setTimeout(() => {
        if (goalArrowRef.current && sceneRef.current) {
          sceneRef.current.remove(goalArrowRef.current);
          goalArrowRef.current = null;
        }
      }, 2000);
    };

    renderer.domElement.addEventListener('mousedown', handleGoToMouseDown, { capture: true });
    renderer.domElement.addEventListener('mousemove', handleGoToMouseMove);
    renderer.domElement.addEventListener('mouseup', handleGoToMouseUp, { capture: true });

    // --- INITIAL POSE MOUSE HANDLERS ---
    const handleInitialPoseMouseDown = (event: MouseEvent) => {
      if (!setInitialPoseModeRef.current || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const intersection = getFloorIntersection(event);
      if (intersection) {
        initialPoseDragStartRef.current = intersection.clone();
        // Create a marker at the click position
        createInitialPoseMarker(intersection);
      }
    };

    const handleInitialPoseMouseMove = (event: MouseEvent) => {
      if (!setInitialPoseModeRef.current) return;

      const intersection = getFloorIntersection(event);
      if (intersection) {
        setMouseWorldPos({ x: intersection.x, y: intersection.z });
        updateCursorMarker(intersection);
      }

      if (!initialPoseDragStartRef.current) return;
      event.preventDefault();

      if (intersection) {
        updateInitialPoseArrow(initialPoseDragStartRef.current, intersection);
      }
    };

    const handleInitialPoseMouseUp = (event: MouseEvent) => {
      if (!setInitialPoseModeRef.current || !initialPoseDragStartRef.current || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const endPos = getFloorIntersection(event);
      const startPos = initialPoseDragStartRef.current;

      if (startPos && endPos) {
        const dx = endPos.x - startPos.x;
        const dz = endPos.z - startPos.z;
        let yaw = 0;

        if (Math.sqrt(dx * dx + dz * dz) > 0.05) {
          yaw = Math.atan2(dz, dx);
        }

        publishInitialPose(startPos, yaw);
      }

      initialPoseDragStartRef.current = null;

      // Remove arrow after short delay
      setTimeout(() => {
        if (initialPoseArrowRef.current && sceneRef.current) {
          sceneRef.current.remove(initialPoseArrowRef.current);
          initialPoseArrowRef.current = null;
        }
      }, 2000);
    };

    renderer.domElement.addEventListener('mousedown', handleInitialPoseMouseDown, { capture: true });
    renderer.domElement.addEventListener('mousemove', handleInitialPoseMouseMove);
    renderer.domElement.addEventListener('mouseup', handleInitialPoseMouseUp, { capture: true });

    // --- 11. RESIZE HANDLING ---
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;
      const newAspect = newWidth / newHeight;

      // Preserve the current view size (top - bottom) and adjust aspect
      const currentViewSize = camera.top - camera.bottom;
      camera.left = -currentViewSize * newAspect / 2;
      camera.right = currentViewSize * newAspect / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // ResizeObserver: detect container size changes (e.g. sidebar open/close)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    // CLEANUP
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousedown', handleGoToMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleGoToMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleGoToMouseUp);
      renderer.domElement.removeEventListener('mousedown', handleInitialPoseMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleInitialPoseMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleInitialPoseMouseUp);
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update robot pose on the map
  const updateRobotPose = async (pose: { x: number; y: number; z: number; yaw: number }) => {
    if (!sceneRef.current || !robotDimensionsRef.current) return;

    // Ensure textures/materials are loaded before creating robot mesh
    if (!robotMaterialRef.current) {
      await loadTexturesOnce();
    }
    if (!robotMaterialRef.current) return; // Still null after loading — bail out

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
    // ROS coordinate mapping: ROS X → Three.js X, ROS Y → Three.js Z
    robotMesh.position.set(pose.x, dims.bodyHeight / 2, pose.y);

    // ROS yaw is counter-clockwise around Z-up, Three.js rotation.y is
    // counter-clockwise around Y-up viewed from above — but Three.js default
    // "forward" is -Z while ROS forward is +X.  We orient the local model so
    // that +X is forward (see arrow/caster below), so we need:
    //   rotation.y = -yaw + π/2  →  but since we define local forward = +X:
    //   rotation.y = -yaw   (maps ROS CCW yaw to Three.js CW Y-rotation)
    robotMesh.rotation.y = -pose.yaw;

    // --- Wheels are placed along the local Z axis (left/right) ---
    const leftWheelGeometry = new THREE.CylinderGeometry(dims.wheelRadius, dims.wheelRadius, dims.wheelThickness, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    
    const leftWheel = new THREE.Mesh(leftWheelGeometry, wheelMaterial);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(0, dims.wheelRadius, -dims.bodyRadius - 0.01); // local -Z = ROS left
    robotMesh.add(leftWheel);

    const rightWheel = new THREE.Mesh(leftWheelGeometry, wheelMaterial);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(0, dims.wheelRadius, dims.bodyRadius + 0.01); // local +Z = ROS right
    robotMesh.add(rightWheel);

    // Caster wheel at the rear (local -X)
    const casterRadius = dims.wheelRadius * 0.25;
    const casterGeometry = new THREE.SphereGeometry(casterRadius, 16, 16);
    const casterMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    
    const casterWheel = new THREE.Mesh(casterGeometry, casterMaterial);
    casterWheel.position.set(-dims.bodyRadius + 0.02, casterRadius, 0); // rear of robot
    robotMesh.add(casterWheel);

    // Direction indicator (arrow) pointing forward along local +X
    const arrowRadius = dims.bodyRadius * 0.6;
    const arrowHeight = dims.bodyHeight * 0.6;
    const arrowGeometry = new THREE.ConeGeometry(arrowRadius, arrowHeight, 8);
    const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000 });
    const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
    // Cone default points up (+Y). Rotate -90° around Z so it points along +X (forward)
    arrowMesh.rotation.z = -Math.PI / 2;
    arrowMesh.position.set(dims.bodyRadius + arrowHeight / 2 + 0.02, dims.bodyHeight / 2, 0);
    robotMesh.add(arrowMesh);

    sceneRef.current.add(robotMesh);
    robotMeshRef.current = robotMesh;

    // Update robot info display
    setRobotInfo({
      name: robotDimensionsRef.current.robotName,
      pose: pose,
    });
  };

  // Adjust camera to fit the loaded map so it's close and clear
  const adjustCameraToMap = (mapWidthMeters: number, mapHeightMeters: number, originPosition: { x: number; y: number }) => {
    const camera = cameraRef.current;
    if (!camera || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const aspect = containerWidth / containerHeight;

    const paddingFactor = 1.15; // keep some padding around the map
    const desiredSize = Math.max(mapWidthMeters, mapHeightMeters) * paddingFactor || 5;

    // Set orthographic frustum in world units (meters)
    camera.left = -desiredSize * aspect / 2;
    camera.right = desiredSize * aspect / 2;
    camera.top = desiredSize / 2;
    camera.bottom = -desiredSize / 2;

    // Center of map in world coords
    const centerX = originPosition.x + mapWidthMeters / 2;
    const centerZ = originPosition.y + mapHeightMeters / 2;

    // Position camera at an isometric angle relative to the map center
    const cameraHeight = Math.max(desiredSize * 0.8, 5);
    const offset = desiredSize * 0.45;
    camera.position.set(centerX + offset, cameraHeight, centerZ + offset);
    camera.lookAt(centerX, 0, centerZ);

    camera.updateProjectionMatrix();
  };

  // --- Create a map-aligned grid overlay with meter lines ---
  const createMapGrid = (
    mapWidthMeters: number,
    mapHeightMeters: number,
    originX: number,
    originY: number,
    resolution: number
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old grid
    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current = null;
    }

    // Also remove placeholder grid if it exists
    const placeholder = scene.getObjectByName('placeholderGrid');
    if (placeholder) {
      scene.remove(placeholder);
    }

    const gridGroup = new THREE.Group();

    // Determine grid spacing: 1m lines, with 0.5m sub-lines
    const majorSpacing = 1.0; // 1 meter
    const minorSpacing = 0.5; // 0.5 meter sub-grid

    // Extend grid slightly beyond map bounds
    const padding = 1.0;
    const minX = Math.floor((originX - padding) / majorSpacing) * majorSpacing;
    const maxX = Math.ceil((originX + mapWidthMeters + padding) / majorSpacing) * majorSpacing;
    const minZ = Math.floor((originY - padding) / majorSpacing) * majorSpacing;
    const maxZ = Math.ceil((originY + mapHeightMeters + padding) / majorSpacing) * majorSpacing;

    const gridHeight = 0.05; // Slightly above the floor

    // --- Minor grid lines (0.5m) ---
    const minorLineMaterial = new THREE.LineBasicMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });

    const minorPoints: THREE.Vector3[] = [];

    // Vertical minor lines (along Z axis)
    for (let x = minX; x <= maxX; x += minorSpacing) {
      // Skip positions that will be major lines
      if (Math.abs(x % majorSpacing) < 0.001) continue;
      minorPoints.push(new THREE.Vector3(x, gridHeight, minZ));
      minorPoints.push(new THREE.Vector3(x, gridHeight, maxZ));
    }

    // Horizontal minor lines (along X axis)
    for (let z = minZ; z <= maxZ; z += minorSpacing) {
      if (Math.abs(z % majorSpacing) < 0.001) continue;
      minorPoints.push(new THREE.Vector3(minX, gridHeight, z));
      minorPoints.push(new THREE.Vector3(maxX, gridHeight, z));
    }

    if (minorPoints.length > 0) {
      const minorGeometry = new THREE.BufferGeometry().setFromPoints(minorPoints);
      const minorLines = new THREE.LineSegments(minorGeometry, minorLineMaterial);
      gridGroup.add(minorLines);
    }

    // --- Major grid lines (1m) ---
    const majorLineMaterial = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    const majorPoints: THREE.Vector3[] = [];

    // Vertical major lines
    for (let x = minX; x <= maxX; x += majorSpacing) {
      majorPoints.push(new THREE.Vector3(x, gridHeight, minZ));
      majorPoints.push(new THREE.Vector3(x, gridHeight, maxZ));
    }

    // Horizontal major lines
    for (let z = minZ; z <= maxZ; z += majorSpacing) {
      majorPoints.push(new THREE.Vector3(minX, gridHeight, z));
      majorPoints.push(new THREE.Vector3(maxX, gridHeight, z));
    }

    if (majorPoints.length > 0) {
      const majorGeometry = new THREE.BufferGeometry().setFromPoints(majorPoints);
      const majorLines = new THREE.LineSegments(majorGeometry, majorLineMaterial);
      gridGroup.add(majorLines);
    }

    // --- Axis lines through origin (X=0, Z=0) ---
    const axisLineMaterial = new THREE.LineBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const axisYMaterial = new THREE.LineBasicMaterial({
      color: 0x4444ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // X-axis line (red) — along X, at Z=0
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX, gridHeight + 0.01, 0),
      new THREE.Vector3(maxX, gridHeight + 0.01, 0),
    ]);
    gridGroup.add(new THREE.LineSegments(xAxisGeom, axisLineMaterial));

    // Z-axis line (blue) — along Z, at X=0 (ROS Y)
    const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, gridHeight + 0.01, minZ),
      new THREE.Vector3(0, gridHeight + 0.01, maxZ),
    ]);
    gridGroup.add(new THREE.LineSegments(zAxisGeom, axisYMaterial));

    // --- Coordinate labels at every 1m along the edges ---
    // Use small sprites for labels
    const createLabel = (text: string, x: number, z: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 16);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(x, gridHeight + 0.3, z);
      sprite.scale.set(0.5, 0.25, 1);
      return sprite;
    };

    // Labels along X axis (at Z = minZ edge)
    for (let x = minX; x <= maxX; x += majorSpacing) {
      if (Math.abs(x) < 0.001 && Math.abs(minZ) < 0.001) continue; // Skip origin label duplication
      gridGroup.add(createLabel(`${x.toFixed(0)}`, x, minZ - 0.3));
    }

    // Labels along Z axis (at X = minX edge) — these represent ROS Y
    for (let z = minZ; z <= maxZ; z += majorSpacing) {
      gridGroup.add(createLabel(`${z.toFixed(0)}`, minX - 0.3, z));
    }

    scene.add(gridGroup);
    gridHelperRef.current = gridGroup;
  };

  // --- GoToPoint: Create/update cursor crosshair on the 3D floor ---
  const updateCursorMarker = (position: THREE.Vector3) => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!cursorMarkerRef.current) {
      // Create cursor crosshair
      const group = new THREE.Group();
      const markerHeight = 0.1;

      // Crosshair lines
      const crossSize = 0.15;
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9, depthWrite: false });

      // Horizontal line
      const hPoints = [
        new THREE.Vector3(-crossSize, 0, 0),
        new THREE.Vector3(crossSize, 0, 0),
      ];
      const hGeom = new THREE.BufferGeometry().setFromPoints(hPoints);
      group.add(new THREE.LineSegments(hGeom, lineMat));

      // Vertical line (along Z)
      const vPoints = [
        new THREE.Vector3(0, 0, -crossSize),
        new THREE.Vector3(0, 0, crossSize),
      ];
      const vGeom = new THREE.BufferGeometry().setFromPoints(vPoints);
      group.add(new THREE.LineSegments(vGeom, lineMat));

      // Small circle around crosshair
      const ringGeom = new THREE.RingGeometry(0.08, 0.1, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);

      group.position.y = markerHeight;
      scene.add(group);
      cursorMarkerRef.current = group;
    }

    // Update position
    cursorMarkerRef.current.position.x = position.x;
    cursorMarkerRef.current.position.z = position.z;
    cursorMarkerRef.current.visible = true;
  };

  const hideCursorMarker = () => {
    if (cursorMarkerRef.current) {
      cursorMarkerRef.current.visible = false;
    }
  };

  // --- GoToPoint: Raycast mouse position onto the floor plane (Y=0) ---
  const getFloorIntersection = (event: MouseEvent): THREE.Vector3 | null => {
    if (!rendererRef.current || !cameraRef.current) return null;

    // Use the canvas element (renderer.domElement) for accurate bounding rect
    const canvas = rendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Ensure camera matrices are up-to-date (critical after OrbitControls panning/zooming)
    const camera = cameraRef.current;
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Intersect with Y=0 plane (the floor)
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(floorPlane, intersection);
    return hit ? intersection : null;
  };

  // --- GoToPoint: Create/update the goal arrow visualization ---
  const updateGoalArrow = (startPos: THREE.Vector3, endPos: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Remove old arrow
    if (goalArrowRef.current) {
      sceneRef.current.remove(goalArrowRef.current);
      goalArrowRef.current = null;
    }

    const group = new THREE.Group();

    // Direction from start to end (on XZ plane)
    const direction = new THREE.Vector3(
      endPos.x - startPos.x,
      0,
      endPos.z - startPos.z
    );
    const length = direction.length();

    if (length < 0.01) return; // Too short, skip

    direction.normalize();

    // Create arrow shaft
    const shaftLength = Math.max(length * 0.7, 0.1);
    const shaftGeometry = new THREE.CylinderGeometry(0.03, 0.03, shaftLength, 8);
    const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.set(shaftLength / 2, 0, 0);
    group.add(shaft);

    // Create arrow head
    const headGeometry = new THREE.ConeGeometry(0.08, 0.2, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.rotation.z = -Math.PI / 2;
    head.position.set(shaftLength + 0.1, 0, 0);
    group.add(head);

    // Position and rotate group
    group.position.copy(startPos);
    group.position.y = 0.15; // Slightly above floor

    // The arrow is built along local +X. To point it in the drag direction on XZ:
    // atan2(dx, dz) gives the angle from +Z toward +X, but we want
    // the angle so that local +X aligns with the direction vector.
    // rotation.y rotates from +Z toward +X (CW from above).
    // For local +X to face direction: rotation.y = atan2(direction.z, direction.x) negated
    // Simplified: rotation.y = -atan2(direction.z, direction.x)
    group.rotation.y = -Math.atan2(direction.z, direction.x);

    sceneRef.current.add(group);
    goalArrowRef.current = group;
  };

  // --- GoToPoint: Create the goal marker (target circle) ---
  const createGoalMarker = (position: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Remove old goal marker
    if (goalMarkerRef.current) {
      sceneRef.current.remove(goalMarkerRef.current);
      goalMarkerRef.current = null;
    }

    const group = new THREE.Group();

    // Outer ring
    const ringGeometry = new THREE.RingGeometry(0.12, 0.16, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Center dot
    const dotGeometry = new THREE.CircleGeometry(0.04, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.rotation.x = -Math.PI / 2;
    group.add(dot);

    group.position.copy(position);
    group.position.y = 0.12;

    sceneRef.current.add(group);
    goalMarkerRef.current = group;
  };

  // --- GoToPoint: Send the navigation goal to ROS (ROS1 Noetic / move_base) ---
  const sendNavigationGoal = (position: THREE.Vector3, yaw: number) => {
    const currentRos = rosRef.current;
    const currentConnected = connectedRef.current;

    if (!currentRos || !currentConnected) {
      setGoalStatus('❌ ROS not connected');
      console.warn('GoToPoint: ROS not connected', { ros: currentRos, connected: currentConnected });
      return;
    }

    // Convert yaw to quaternion
    const halfYaw = yaw / 2;
    const qz = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

    // In the 3D scene: X = ROS X, Z = ROS Y (because we map row*cellSize to Z)
    const rosX = position.x;
    const rosY = position.z;

    // --- Method 1: ROS1 move_base Action Client ---
    try {
      const moveBaseClient = new ROSLIB.ActionClient({
        ros: currentRos,
        serverName: '/move_base',
        actionName: 'move_base_msgs/MoveBaseAction',
      });

      const goal = new ROSLIB.Goal({
        actionClient: moveBaseClient,
        goalMessage: {
          target_pose: {
            header: {
              frame_id: 'map',
            },
            pose: {
              position: { x: rosX, y: rosY, z: 0.0 },
              orientation: { x: 0.0, y: 0.0, z: qz, w: qw },
            },
          },
        },
      });

      setGoalStatus(`⏳ Sending goal: (${rosX.toFixed(2)}, ${rosY.toFixed(2)}) yaw: ${(yaw * 180 / Math.PI).toFixed(1)}°`);

      goal.on('feedback', (feedback: any) => {
        const base = feedback.base_position?.pose?.position;
        if (base) {
          setGoalStatus(`🚗 Moving... pos: (${base.x.toFixed(2)}, ${base.y.toFixed(2)})`);
        }
      });

      goal.on('result', () => {
        setGoalStatus('✅ Goal reached!');
        // Remove goal marker when reached
        if (goalMarkerRef.current && sceneRef.current) {
          sceneRef.current.remove(goalMarkerRef.current);
          goalMarkerRef.current = null;
        }
        setTimeout(() => setGoalStatus(''), 5000);
      });

      goal.on('timeout', () => {
        setGoalStatus('⚠️ Goal timed out');
        setTimeout(() => setGoalStatus(''), 5000);
      });

      goal.send();

      console.log('🎯 move_base goal sent:', { x: rosX, y: rosY, yawDeg: (yaw * 180 / Math.PI).toFixed(1) });
    } catch (actionError) {
      console.warn('move_base action failed, falling back to /move_base_simple/goal topic:', actionError);

      // --- Method 2: Fallback — publish to /move_base_simple/goal (ROS1) ---
      const goalTopic = new ROSLIB.Topic({
        ros: currentRos,
        name: '/move_base_simple/goal',
        messageType: 'geometry_msgs/PoseStamped',
      });

      const goalMessage = {
        header: {
          frame_id: 'map',
        },
        pose: {
          position: { x: rosX, y: rosY, z: 0.0 },
          orientation: { x: 0.0, y: 0.0, z: qz, w: qw },
        },
      };

      goalTopic.publish(goalMessage);
      setGoalStatus(`✅ Goal published: (${rosX.toFixed(2)}, ${rosY.toFixed(2)}) yaw: ${(yaw * 180 / Math.PI).toFixed(1)}°`);
      setTimeout(() => setGoalStatus(''), 5000);
    }

    console.log('Navigation goal sent:', {
      x: rosX,
      y: rosY,
      yaw: yaw,
      yawDeg: (yaw * 180 / Math.PI).toFixed(1),
    });
  };

  // --- GoToPoint: Toggle mode ---
  const toggleGoToPointMode = useCallback(() => {
    const newMode = !goToPointModeRef.current;
    goToPointModeRef.current = newMode;
    setGoToPointMode(newMode);

    // Disable initial pose mode if entering GoToPoint mode
    if (newMode && setInitialPoseModeRef.current) {
      setInitialPoseModeRef.current = false;
      setSetInitialPoseMode(false);
    }

    if (controlsRef.current) {
      controlsRef.current.enabled = !newMode;
    }

    // Clean up visuals when deactivating
    if (!newMode) {
      if (goalArrowRef.current && sceneRef.current) {
        sceneRef.current.remove(goalArrowRef.current);
        goalArrowRef.current = null;
      }
      dragStartRef.current = null;
      setMouseWorldPos(null);
      hideCursorMarker();
    }

    // Change cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = newMode ? 'crosshair' : 'default';
    }
  }, []);

  // --- Initial Pose: Create marker at click position ---
  const createInitialPoseMarker = (position: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Remove old marker
    if (initialPoseMarkerRef.current) {
      sceneRef.current.remove(initialPoseMarkerRef.current);
      initialPoseMarkerRef.current = null;
    }

    const group = new THREE.Group();

    // Outer ring (orange/amber for initial pose)
    const ringGeometry = new THREE.RingGeometry(0.12, 0.16, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Center dot
    const dotGeometry = new THREE.CircleGeometry(0.04, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.rotation.x = -Math.PI / 2;
    group.add(dot);

    group.position.copy(position);
    group.position.y = 0.12;

    sceneRef.current.add(group);
    initialPoseMarkerRef.current = group;
  };

  // --- Initial Pose: Create/update arrow visualization ---
  const updateInitialPoseArrow = (startPos: THREE.Vector3, endPos: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Remove old arrow
    if (initialPoseArrowRef.current) {
      sceneRef.current.remove(initialPoseArrowRef.current);
      initialPoseArrowRef.current = null;
    }

    const group = new THREE.Group();

    const direction = new THREE.Vector3(
      endPos.x - startPos.x,
      0,
      endPos.z - startPos.z
    );
    const length = direction.length();

    if (length < 0.01) return;

    direction.normalize();

    // Arrow shaft (orange)
    const shaftLength = Math.max(length * 0.7, 0.1);
    const shaftGeometry = new THREE.CylinderGeometry(0.03, 0.03, shaftLength, 8);
    const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.set(shaftLength / 2, 0, 0);
    group.add(shaft);

    // Arrow head (orange)
    const headGeometry = new THREE.ConeGeometry(0.08, 0.2, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.rotation.z = -Math.PI / 2;
    head.position.set(shaftLength + 0.1, 0, 0);
    group.add(head);

    group.position.copy(startPos);
    group.position.y = 0.15;

    group.rotation.y = -Math.atan2(direction.z, direction.x);

    sceneRef.current.add(group);
    initialPoseArrowRef.current = group;
  };

  // --- Initial Pose: Publish to /initialpose (ROS Noetic AMCL) ---
  const publishInitialPose = (position: THREE.Vector3, yaw: number) => {
    const currentRos = rosRef.current;
    const currentConnected = connectedRef.current;

    if (!currentRos || !currentConnected) {
      setInitialPoseStatus('❌ ROS not connected');
      return;
    }

    // Convert yaw to quaternion
    const halfYaw = yaw / 2;
    const qz = Math.sin(halfYaw);
    const qw = Math.cos(halfYaw);

    // In 3D scene: X = ROS X, Z = ROS Y
    const rosX = position.x;
    const rosY = position.z;

    // Publish to /initialpose topic (geometry_msgs/PoseWithCovarianceStamped)
    // This is the topic that AMCL subscribes to for setting initial pose in ROS Noetic
    const initialPoseTopic = new ROSLIB.Topic({
      ros: currentRos,
      name: '/initialpose',
      messageType: 'geometry_msgs/PoseWithCovarianceStamped',
    });

    const poseMessage = {
      header: {
        frame_id: 'map',
      },
      pose: {
        pose: {
          position: { x: rosX, y: rosY, z: 0.0 },
          orientation: { x: 0.0, y: 0.0, z: qz, w: qw },
        },
        covariance: [
          0.25, 0.0, 0.0, 0.0, 0.0, 0.0,
          0.0, 0.25, 0.0, 0.0, 0.0, 0.0,
          0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
          0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
          0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
          0.0, 0.0, 0.0, 0.0, 0.0, 0.06853891945200942,
        ],
      },
    };

    initialPoseTopic.publish(poseMessage);
    setInitialPoseStatus(
      `✅ Initial pose set: (${rosX.toFixed(2)}, ${rosY.toFixed(2)}) yaw: ${(yaw * 180 / Math.PI).toFixed(1)}°`
    );

    console.log('📍 Initial pose published to /initialpose:', {
      x: rosX,
      y: rosY,
      yaw: yaw,
      yawDeg: (yaw * 180 / Math.PI).toFixed(1),
    });

    // Clean up marker after delay
    setTimeout(() => {
      if (initialPoseMarkerRef.current && sceneRef.current) {
        sceneRef.current.remove(initialPoseMarkerRef.current);
        initialPoseMarkerRef.current = null;
      }
      setInitialPoseStatus('');
    }, 5000);
  };

  // --- Initial Pose: Toggle mode ---
  const toggleSetInitialPoseMode = useCallback(() => {
    const newMode = !setInitialPoseModeRef.current;
    setInitialPoseModeRef.current = newMode;
    setSetInitialPoseMode(newMode);

    // Disable GoToPoint mode if entering initial pose mode
    if (newMode && goToPointModeRef.current) {
      goToPointModeRef.current = false;
      setGoToPointMode(false);
    }

    if (controlsRef.current) {
      controlsRef.current.enabled = !newMode;
    }

    // Clean up visuals when deactivating
    if (!newMode) {
      if (initialPoseArrowRef.current && sceneRef.current) {
        sceneRef.current.remove(initialPoseArrowRef.current);
        initialPoseArrowRef.current = null;
      }
      if (initialPoseMarkerRef.current && sceneRef.current) {
        sceneRef.current.remove(initialPoseMarkerRef.current);
        initialPoseMarkerRef.current = null;
      }
      initialPoseDragStartRef.current = null;
      setMouseWorldPos(null);
      hideCursorMarker();
    }

    // Change cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = newMode ? 'crosshair' : 'default';
    }
  }, []);

  // --- Subscribe to /amcl_pose to display AMCL estimated pose ---
  useEffect(() => {
    if (!ros || !connected) return;

    if (amclPoseTopicRef.current) {
      amclPoseTopicRef.current.unsubscribe();
      amclPoseTopicRef.current = null;
    }

    const topic = new ROSLIB.Topic({
      ros,
      name: '/amcl_pose',
      messageType: 'geometry_msgs/PoseWithCovarianceStamped',
      throttle_rate: 500,
    });

    topic.subscribe((message: any) => {
      const pos = message.pose.pose.position;
      const orient = message.pose.pose.orientation;
      const yaw = Math.atan2(
        2.0 * (orient.w * orient.z + orient.x * orient.y),
        1.0 - 2.0 * (orient.y * orient.y + orient.z * orient.z)
      );
      setAmclPose({ x: pos.x, y: pos.y, yaw });
    });

    amclPoseTopicRef.current = topic;
    console.log('Subscribed to /amcl_pose (AMCL estimated pose)');

    return () => {
      if (amclPoseTopicRef.current) {
        amclPoseTopicRef.current.unsubscribe();
        amclPoseTopicRef.current = null;
      }
    };
  }, [ros, connected]);

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

      // Fit camera to the newly rendered map ONLY on first load
      // so user can freely rotate/zoom without being reset
      if (!cameraAdjustedRef.current) {
        try {
          const mapWidthMeters = width * resolution;
          const mapHeightMeters = height * resolution;
          adjustCameraToMap(mapWidthMeters, mapHeightMeters, origin.position);
          cameraAdjustedRef.current = true;
        } catch (e) {
          console.warn('Failed to adjust camera to map:', e);
        }
      }

      // Create/update map-aligned grid overlay
      {
        const mapWidthMeters = width * resolution;
        const mapHeightMeters = height * resolution;
        mapInfoRef.current = {
          widthMeters: mapWidthMeters,
          heightMeters: mapHeightMeters,
          originX: origin.position.x,
          originY: origin.position.y,
          resolution,
        };
        createMapGrid(mapWidthMeters, mapHeightMeters, origin.position.x, origin.position.y, resolution);
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
  }, [ros, connected]);

  // Update robot pose when it changes
  useEffect(() => {
    if (robotPose && sceneRef.current) {
      updateRobotPose(robotPose);
    }
  }, [robotPose, scaleFactor]);

  // Toggle map (occupancy grid) visibility
  useEffect(() => {
    if (voxelGroupRef.current) {
      voxelGroupRef.current.visible = showMap;
    }
  }, [showMap]);

  // Toggle robot visibility
  useEffect(() => {
    if (robotMeshRef.current) {
      robotMeshRef.current.visible = showRobot;
    }
  }, [showRobot]);

  // --- Render Global Plan: line + single arrow at the end ---
  const renderGlobalPlan = (
    poses: Array<{ pose: { position: { x: number; y: number; z: number } } }>,
    yOffset: number = 0.15
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old line
    if (globalPlanLineRef.current) {
      scene.remove(globalPlanLineRef.current);
      if (globalPlanLineRef.current.geometry) globalPlanLineRef.current.geometry.dispose();
      if (globalPlanLineRef.current.material) {
        const mat = globalPlanLineRef.current.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
      globalPlanLineRef.current = null;
    }

    // Remove old arrow
    if (globalPlanArrowsRef.current) {
      scene.remove(globalPlanArrowsRef.current);
      globalPlanArrowsRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      });
      globalPlanArrowsRef.current = null;
    }

    if (!poses || poses.length < 2) return;

    // ROS: position.x → Three.js X, position.y → Three.js Z
    const points: THREE.Vector3[] = poses.map(
      (p) => new THREE.Vector3(p.pose.position.x, yOffset, p.pose.position.y)
    );

    // Draw the line
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    scene.add(line);
    globalPlanLineRef.current = line;

    // Single arrow at the END of the path
    const arrowGroup = new THREE.Group();
    const last = points[points.length - 1];
    const backIdx = Math.max(0, points.length - 10);
    const dx = last.x - points[backIdx].x;
    const dz = last.z - points[backIdx].z;
    const len = Math.sqrt(dx * dx + dz * dz);

    if (len > 0.001) {
      const dir = new THREE.Vector3(dx, 0, dz).normalize();

      const coneGeom = new THREE.ConeGeometry(0.08, 0.2, 8);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.set(last.x, yOffset, last.z);

      // Rotate cone tip (+Y default) to face path direction
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.quaternion.copy(quat);
      arrowGroup.add(cone);
    }

    scene.add(arrowGroup);
    globalPlanArrowsRef.current = arrowGroup;
  };

  // --- Render Local Plan: line only, no arrows (purple) ---
  const renderLocalPlan = (
    poses: Array<{ pose: { position: { x: number; y: number; z: number } } }>,
    yOffset: number = 0.15
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old line
    if (localPlanLineRef.current) {
      scene.remove(localPlanLineRef.current);
      if (localPlanLineRef.current.geometry) localPlanLineRef.current.geometry.dispose();
      if (localPlanLineRef.current.material) {
        const mat = localPlanLineRef.current.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
      localPlanLineRef.current = null;
    }

    // Remove old arrows (cleanup from previous version)
    if (localPlanArrowsRef.current) {
      scene.remove(localPlanArrowsRef.current);
      localPlanArrowsRef.current = null;
    }

    if (!poses || poses.length < 2) return;

    // Local plan is in odom frame — transform to map frame via TF, then to Three.js
    const tf = odomToMapRef.current;
    let points: THREE.Vector3[];

    if (tf) {
      const cosY = Math.cos(tf.yaw);
      const sinY = Math.sin(tf.yaw);
      points = poses.map((p) => {
        // odom frame coords
        const ox = p.pose.position.x;
        const oy = p.pose.position.y;
        // transform to map frame: rotate then translate
        const mx = cosY * ox - sinY * oy + tf.tx;
        const my = sinY * ox + cosY * oy + tf.ty;
        // map to Three.js: ROS X → Three.js X, ROS Y → Three.js Z
        return new THREE.Vector3(mx, yOffset, my);
      });
    } else {
      // Fallback if TF not yet received: use raw coords
      points = poses.map(
        (p) => new THREE.Vector3(p.pose.position.x, yOffset, p.pose.position.y)
      );
    }

    // Draw the line (purple)
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xaa00ff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    scene.add(line);
    localPlanLineRef.current = line;
  };

  // --- Subscribe to global planner path: /move_base/NavfnROS/plan ---
  useEffect(() => {
    if (!ros || !connected) return;

    // Clean up previous subscription
    if (globalPlanTopicRef.current) {
      globalPlanTopicRef.current.unsubscribe();
      globalPlanTopicRef.current = null;
    }

    if (!showGlobalPlan) {
      // Remove line and arrows from scene when disabled
      if (globalPlanLineRef.current && sceneRef.current) {
        sceneRef.current.remove(globalPlanLineRef.current);
        if (globalPlanLineRef.current.geometry) globalPlanLineRef.current.geometry.dispose();
        if (globalPlanLineRef.current.material) {
          const mat = globalPlanLineRef.current.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
        globalPlanLineRef.current = null;
      }
      if (globalPlanArrowsRef.current && sceneRef.current) {
        sceneRef.current.remove(globalPlanArrowsRef.current);
        globalPlanArrowsRef.current = null;
      }
      return;
    }

    const topic = new ROSLIB.Topic({
      ros,
      name: '/move_base/NavfnROS/plan',
      messageType: 'nav_msgs/Path',
    });

    topic.subscribe((message: any) => {
      renderGlobalPlan(message.poses);
    });

    globalPlanTopicRef.current = topic;
    console.log('Subscribed to /move_base/NavfnROS/plan (Global Planner - map frame)');

    return () => {
      if (globalPlanTopicRef.current) {
        globalPlanTopicRef.current.unsubscribe();
        globalPlanTopicRef.current = null;
      }
    };
  }, [ros, connected, showGlobalPlan]);

  // --- Subscribe to local planner path: /move_base/DWAPlannerROS/local_plan ---
  useEffect(() => {
    if (!ros || !connected) return;

    // Clean up previous subscription
    if (localPlanTopicRef.current) {
      localPlanTopicRef.current.unsubscribe();
      localPlanTopicRef.current = null;
    }

    if (!showLocalPlan) {
      // Remove line and arrows from scene when disabled
      if (localPlanLineRef.current && sceneRef.current) {
        sceneRef.current.remove(localPlanLineRef.current);
        if (localPlanLineRef.current.geometry) localPlanLineRef.current.geometry.dispose();
        if (localPlanLineRef.current.material) {
          const mat = localPlanLineRef.current.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
        localPlanLineRef.current = null;
      }
      if (localPlanArrowsRef.current && sceneRef.current) {
        sceneRef.current.remove(localPlanArrowsRef.current);
        localPlanArrowsRef.current = null;
      }
      return;
    }

    const topic = new ROSLIB.Topic({
      ros,
      name: '/move_base/DWAPlannerROS/local_plan',
      messageType: 'nav_msgs/Path',
    });

    topic.subscribe((message: any) => {
      renderLocalPlan(message.poses);
    });

    localPlanTopicRef.current = topic;
    console.log('Subscribed to /move_base/DWAPlannerROS/local_plan (Local Planner)');

    return () => {
      if (localPlanTopicRef.current) {
        localPlanTopicRef.current.unsubscribe();
        localPlanTopicRef.current = null;
      }
    };
  }, [ros, connected, showLocalPlan]);

  // --- Render LaserScan as green spheres in front of walls ---
  const renderLaserScan = (scanMsg: any) => {
    const scene = sceneRef.current;
    const pose = robotPoseRef.current;
    if (!scene || !pose) return;

    // Remove old laser group
    if (laserPointsRef.current) {
      scene.remove(laserPointsRef.current);
      laserPointsRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      laserPointsRef.current = null;
    }

    const { angle_min, angle_increment, ranges, range_min, range_max } = scanMsg;
    const cosYaw = Math.cos(pose.yaw);
    const sinYaw = Math.sin(pose.yaw);

    const resolution = mapInfoRef.current?.resolution ?? 0.05;
    const wallHeight = resolution * 3;
    const yPos = wallHeight; // on top of the wall
    const dotRadius = resolution * 0.6;

    // Collect valid positions
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r < range_min || r > range_max || !isFinite(r)) continue;

      const angle = angle_min + i * angle_increment;
      const lx = r * Math.cos(angle);
      const ly = r * Math.sin(angle);
      const mx = cosYaw * lx - sinYaw * ly + pose.x;
      const my = sinYaw * lx + cosYaw * ly + pose.y;
      pts.push({ x: mx, z: my });
    }

    if (pts.length === 0) return;

    const group = new THREE.Group();

    // InstancedMesh with small spheres — guaranteed visible
    const sphereGeo = new THREE.SphereGeometry(dotRadius, 6, 4);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      depthTest: false,
    });

    const instMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, pts.length);
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < pts.length; i++) {
      matrix.setPosition(pts[i].x, yPos, pts[i].z);
      instMesh.setMatrixAt(i, matrix);
    }
    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.renderOrder = 999;
    group.add(instMesh);

    group.renderOrder = 999;
    scene.add(group);
    laserPointsRef.current = group;
  };

  // --- Subscribe to /scan (LaserScan) ---
  useEffect(() => {
    if (!ros || !connected) return;

    // Clean up previous subscription
    if (laserTopicRef.current) {
      laserTopicRef.current.unsubscribe();
      laserTopicRef.current = null;
    }

    if (!showLaserScan) {
      // Remove laser group from scene when disabled
      if (laserPointsRef.current && sceneRef.current) {
        sceneRef.current.remove(laserPointsRef.current);
        laserPointsRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
        laserPointsRef.current = null;
      }
      return;
    }

    const topic = new ROSLIB.Topic({
      ros,
      name: '/scan',
      messageType: 'sensor_msgs/LaserScan',
      throttle_rate: 100, // Limit to ~10 updates/sec for performance
    });

    topic.subscribe((message: any) => {
      renderLaserScan(message);
    });

    laserTopicRef.current = topic;
    console.log('Subscribed to /scan (LaserScan)');

    return () => {
      if (laserTopicRef.current) {
        laserTopicRef.current.unsubscribe();
        laserTopicRef.current = null;
      }
    };
  }, [ros, connected, showLaserScan]);

  // --- Render local costmap as colored overlay ---
  const renderCostmap = (message: any) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old costmap mesh
    if (costmapMeshRef.current) {
      scene.remove(costmapMeshRef.current);
      if (costmapMeshRef.current.geometry) costmapMeshRef.current.geometry.dispose();
      if (costmapMeshRef.current.material) {
        const mat = costmapMeshRef.current.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
      costmapMeshRef.current = null;
    }

    const { data } = message;
    const { width, height, resolution, origin } = message.info;
    const cellSize = resolution;
    const yOffset = 0.01; // just above the floor

    // odom→map transform (local costmap is typically in odom frame)
    const tf = odomToMapRef.current;
    const hasTf = tf !== null;
    const cosY = hasTf ? Math.cos(tf!.yaw) : 1;
    const sinY = hasTf ? Math.sin(tf!.yaw) : 0;
    const tfTx = hasTf ? tf!.tx : 0;
    const tfTy = hasTf ? tf!.ty : 0;

    // Also handle the costmap origin orientation (quaternion → yaw)
    const oq = origin.orientation;
    const originYaw = Math.atan2(
      2.0 * (oq.w * oq.z + oq.x * oq.y),
      1.0 - 2.0 * (oq.y * oq.y + oq.z * oq.z)
    );
    const cosOrigin = Math.cos(originYaw);
    const sinOrigin = Math.sin(originYaw);

    // Count cells with cost > 0 (skip free space)
    let costCellCount = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0 && data[i] <= 100) costCellCount++;
    }

    if (costCellCount === 0) return;

    // Use a plane geometry for each costmap cell (thin flat square)
    const geometry = new THREE.PlaneGeometry(cellSize, cellSize);
    geometry.rotateX(-Math.PI / 2); // lay flat on XZ plane

    // Transparent material — color is set per-instance
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, costCellCount);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    let idx = 0;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = data[col + row * width];
        if (value <= 0 || value > 100) continue;

        // Cell position in costmap's own frame (apply origin rotation)
        const cellLocalX = col * cellSize;
        const cellLocalY = row * cellSize;
        const odomX = cosOrigin * cellLocalX - sinOrigin * cellLocalY + origin.position.x;
        const odomY = sinOrigin * cellLocalX + cosOrigin * cellLocalY + origin.position.y;

        // Transform odom → map frame
        const mapX = cosY * odomX - sinY * odomY + tfTx;
        const mapY = sinY * odomX + cosY * odomY + tfTy;

        // Three.js: ROS X → X, ROS Y → Z
        matrix.setPosition(mapX, yOffset, mapY);
        mesh.setMatrixAt(idx, matrix);

        // Color by cost: low cost = cyan/blue, mid = yellow, high = red, lethal(100) = magenta
        const t = value / 100;
        if (value >= 99) {
          color.setHex(0xff00ff); // lethal — magenta
        } else if (t > 0.7) {
          // red zone
          color.setRGB(1.0, 0.2 * (1 - t) / 0.3, 0);
        } else if (t > 0.3) {
          // yellow zone
          const s = (t - 0.3) / 0.4;
          color.setRGB(s, 1.0, 0);
        } else {
          // cyan/blue zone
          const s = t / 0.3;
          color.setRGB(0, s, 1.0 - s * 0.5);
        }

        mesh.setColorAt(idx, color);
        idx++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
    costmapMeshRef.current = mesh;
  };

  // --- Subscribe to /move_base/local_costmap/costmap ---
  useEffect(() => {
    if (!ros || !connected) return;

    // Clean up previous subscription
    if (costmapTopicRef.current) {
      costmapTopicRef.current.unsubscribe();
      costmapTopicRef.current = null;
    }

    if (!showCostmap) {
      // Remove costmap mesh when disabled
      if (costmapMeshRef.current && sceneRef.current) {
        sceneRef.current.remove(costmapMeshRef.current);
        if (costmapMeshRef.current.geometry) costmapMeshRef.current.geometry.dispose();
        if (costmapMeshRef.current.material) {
          const mat = costmapMeshRef.current.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
        costmapMeshRef.current = null;
      }
      return;
    }

    const topic = new ROSLIB.Topic({
      ros,
      name: '/move_base/local_costmap/costmap',
      messageType: 'nav_msgs/OccupancyGrid',
      throttle_rate: 500, // update ~2x/sec for performance
    });

    topic.subscribe((message: any) => {
      renderCostmap(message);
    });

    costmapTopicRef.current = topic;
    console.log('Subscribed to /move_base/local_costmap/costmap');

    return () => {
      if (costmapTopicRef.current) {
        costmapTopicRef.current.unsubscribe();
        costmapTopicRef.current = null;
      }
    };
  }, [ros, connected, showCostmap]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400">
      <div className="absolute top-4 left-4 z-10 text-white font-mono text-xs bg-black/50 rounded max-w-xs max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        <button
          onClick={() => setShowPanel((v) => !v)}
          className="flex items-center justify-between w-full p-3 font-bold hover:bg-white/10 transition-colors rounded-t"
        >
          <span>🤖 ROS 2D MAP VIEWER</span>
          <span className="text-[10px] ml-2">{showPanel ? '▲' : '▼'}</span>
        </button>
        {showPanel && (
        <div className="px-3 pb-3 space-y-2">
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
          <button onClick={() => togglePanel('robotInfo')} className="flex items-center justify-between w-full font-bold text-blue-300 mb-1 hover:text-blue-200 transition-colors">
            <span>📋 Robot Info</span>
            <span className="text-[10px]">{panelOpen.robotInfo ? '▲' : '▼'}</span>
          </button>
          {panelOpen.robotInfo && (
            <div className="text-xs">Model: {robotInfo?.name || 'Loading...'}</div>
          )}
        </div>

        {/* Robot Dimensions from URDF */}
        {robotDimensionsRef.current && (
          <div className="text-xs mt-2 border-t border-gray-600 pt-2">
            <button onClick={() => togglePanel('dimensions')} className="flex items-center justify-between w-full font-bold text-cyan-300 mb-1 hover:text-cyan-200 transition-colors">
              <span>📐 Dimensions (URDF)</span>
              <span className="text-[10px]">{panelOpen.dimensions ? '▲' : '▼'}</span>
            </button>
            {panelOpen.dimensions && (
              <>
                <div>Body Radius: {robotDimensionsRef.current.bodyRadius.toFixed(3)}m</div>
                <div>Body Height: {robotDimensionsRef.current.bodyHeight.toFixed(3)}m</div>
                <div>Wheel Radius: {robotDimensionsRef.current.wheelRadius.toFixed(3)}m</div>
                <div>Wheel Base: {robotDimensionsRef.current.wheelBase.toFixed(3)}m</div>
                <div className={`mt-1 ${scaleFactor !== 1.0 ? 'text-orange-300' : 'text-gray-400'}`}>
                  🔧 Scale: {scaleFactor.toFixed(2)}x
                  {scaleFactor !== 1.0 && <span className="text-xs"> (Gazebo adjusted)</span>}
                </div>
              </>
            )}
          </div>
        )}

        {/* Map Information */}
        {mapLoaded && (
          <div className="text-xs mt-2 border-t border-gray-600 pt-2">
            <button onClick={() => togglePanel('mapInfo')} className="flex items-center justify-between w-full font-bold text-purple-300 mb-1 hover:text-purple-200 transition-colors">
              <span>🗺️ Map Info</span>
              <span className="text-[10px]">{panelOpen.mapInfo ? '▲' : '▼'}</span>
            </button>
            {panelOpen.mapInfo && (
              <>
                <div>Resolution: {(mapResolution * 100).toFixed(1)}cm/px</div>
                <div className="text-xs text-gray-400">
                  ({mapResolution.toFixed(4)}m/px)
                </div>
              </>
            )}
          </div>
        )}

        {/* Robot Pose */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <button onClick={() => togglePanel('pose')} className="flex items-center justify-between w-full font-bold text-green-300 mb-1 hover:text-green-200 transition-colors">
            <span>📍 Robot Pose</span>
            <span className="text-[10px]">{panelOpen.pose ? '▲' : '▼'}</span>
          </button>
          {panelOpen.pose && (
            robotInfo?.pose ? (
              <>
                <div>X: {robotInfo.pose.x.toFixed(3)} m</div>
                <div>Y: {robotInfo.pose.y.toFixed(3)} m</div>
                <div>Z: {robotInfo.pose.z.toFixed(3)} m</div>
                <div>Yaw: {robotInfo.pose.yaw.toFixed(3)} rad</div>
              </>
            ) : (
              <div className="text-gray-400">Waiting for pose data...</div>
            )
          )}
        </div>

        {/* Visibility Toggles */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <button onClick={() => togglePanel('visibility')} className="flex items-center justify-between w-full font-bold text-emerald-300 mb-1 hover:text-emerald-200 transition-colors">
            <span>👁 Visibility</span>
            <span className="text-[10px]">{panelOpen.visibility ? '▲' : '▼'}</span>
          </button>
          {panelOpen.visibility && (
            <>

          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showMap}
              onChange={() => setShowMap((v) => !v)}
              className="accent-gray-400"
            />
            <span className="inline-block w-3 h-3 bg-gray-600 border border-gray-400 rounded-sm"></span>
            <span>Map (Occupancy Grid)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showRobot}
              onChange={() => setShowRobot((v) => !v)}
              className="accent-blue-500"
            />
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full"></span>
            <span>Robot</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showGlobalPlan}
              onChange={() => setShowGlobalPlan((v) => !v)}
              className="accent-green-500"
            />
            <span className="inline-block w-4 h-0.5 bg-green-400 rounded"></span>
            <span>Global Plan</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLocalPlan}
              onChange={() => setShowLocalPlan((v) => !v)}
              className="accent-purple-500"
            />
            <span className="inline-block w-4 h-0.5 bg-purple-400 rounded"></span>
            <span>Local Plan</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLaserScan}
              onChange={() => setShowLaserScan((v) => !v)}
              className="accent-green-500"
            />
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full"></span>
            <span>Laser Scan</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCostmap}
              onChange={() => setShowCostmap((v) => !v)}
              className="accent-yellow-500"
            />
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #00bfff, #ffff00, #ff4444)' }}></span>
            <span>Local Costmap</span>
          </label>
          </>
          )}
        </div>

        {/* GoToPoint */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <button onClick={() => togglePanel('navigation')} className="flex items-center justify-between w-full font-bold text-yellow-300 mb-1 hover:text-yellow-200 transition-colors">
            <span>🎯 Navigation</span>
            <span className="text-[10px]">{panelOpen.navigation ? '▲' : '▼'}</span>
          </button>
          {panelOpen.navigation && (
            <>
          <button
            onClick={toggleGoToPointMode}
            className={`w-full px-3 py-2 rounded text-xs font-bold transition-all ${
              goToPointMode
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {goToPointMode ? '✋ Cancel GoToPoint' : '📍 GoToPoint'}
          </button>
          {goToPointMode && (
            <div className="mt-1 text-yellow-200 text-[10px]">
              คลิกบนแผนที่เพื่อเลือกตำแหน่ง แล้วลากเพื่อกำหนดทิศทาง
            </div>
          )}
          {goToPointMode && mouseWorldPos && (
            <div className="mt-1 bg-gray-800 rounded px-2 py-1 text-[11px] font-mono">
              <span className="text-cyan-300">X:</span> {mouseWorldPos.x.toFixed(3)}m{' '}
              <span className="text-cyan-300">Y:</span> {mouseWorldPos.y.toFixed(3)}m
            </div>
          )}
          {goalStatus && (
            <div className="mt-1 text-green-300 text-[10px]">{goalStatus}</div>
          )}
            </>
          )}
        </div>

        {/* Set Initial Pose */}
        <div className="text-xs mt-2 border-t border-gray-600 pt-2">
          <button onClick={() => togglePanel('initialPose')} className="flex items-center justify-between w-full font-bold text-orange-300 mb-1 hover:text-orange-200 transition-colors">
            <span>📌 Initial Pose (AMCL)</span>
            <span className="text-[10px]">{panelOpen.initialPose ? '▲' : '▼'}</span>
          </button>
          {panelOpen.initialPose && (
            <>
          <button
            onClick={toggleSetInitialPoseMode}
            className={`w-full px-3 py-2 rounded text-xs font-bold transition-all ${
              setInitialPoseMode
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            {setInitialPoseMode ? '✋ Cancel Set Pose' : '📌 Set Initial Pose'}
          </button>
          {setInitialPoseMode && (
            <div className="mt-1 text-orange-200 text-[10px]">
              คลิกบนแผนที่เพื่อเลือกตำแหน่งเริ่มต้น แล้วลากเพื่อกำหนดทิศทาง
            </div>
          )}
          {setInitialPoseMode && mouseWorldPos && (
            <div className="mt-1 bg-gray-800 rounded px-2 py-1 text-[11px] font-mono">
              <span className="text-orange-300">X:</span> {mouseWorldPos.x.toFixed(3)}m{' '}
              <span className="text-orange-300">Y:</span> {mouseWorldPos.y.toFixed(3)}m
            </div>
          )}
          {initialPoseStatus && (
            <div className="mt-1 text-orange-300 text-[10px]">{initialPoseStatus}</div>
          )}
          {amclPose && (
            <div className="mt-2 bg-gray-800/70 rounded px-2 py-1.5 text-[11px]">
              <div className="font-bold text-orange-300 mb-0.5">AMCL Pose (/amcl_pose):</div>
              <div>X: {amclPose.x.toFixed(3)} m</div>
              <div>Y: {amclPose.y.toFixed(3)} m</div>
              <div>Yaw: {amclPose.yaw.toFixed(3)} rad ({(amclPose.yaw * 180 / Math.PI).toFixed(1)}°)</div>
            </div>
          )}
            </>
          )}
        </div>
        </div>
        )}
      </div>

      {/* Floating GoToPoint indicator */}
      {goToPointMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-green-600/90 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce">
          🎯 GoToPoint Mode — คลิกและลากบนแผนที่
        </div>
      )}

      {/* Floating Initial Pose indicator */}
      {setInitialPoseMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-orange-600/90 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce">
          📌 Set Initial Pose — คลิกและลากเพื่อกำหนดตำแหน่งและทิศทาง
        </div>
      )}

      {/* Floating coordinate display when in GoToPoint mode */}
      {goToPointMode && mouseWorldPos && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-mono shadow-lg border border-cyan-500/50">
          <span className="text-cyan-400">📍 X:</span> {mouseWorldPos.x.toFixed(3)}m{' '}
          <span className="text-cyan-400">Y:</span> {mouseWorldPos.y.toFixed(3)}m
        </div>
      )}

      {/* Floating coordinate display when in Initial Pose mode */}
      {setInitialPoseMode && mouseWorldPos && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-mono shadow-lg border border-orange-500/50">
          <span className="text-orange-400">📌 X:</span> {mouseWorldPos.x.toFixed(3)}m{' '}
          <span className="text-orange-400">Y:</span> {mouseWorldPos.y.toFixed(3)}m
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default IsometricMap;