'use client';

import * as THREE from 'three';

export class RobotVisualizer {
  private group: THREE.Group;
  private robotMesh: THREE.Mesh | null = null;
  private directionArrow: THREE.Mesh | null = null;
  private textureLoader: THREE.TextureLoader;

  constructor(scene: THREE.Scene, public robotScale: number = 0.5) {
    this.group = new THREE.Group();
    this.group.name = 'RobotGroup';
    scene.add(this.group);
    this.textureLoader = new THREE.TextureLoader();
  }

  /**
   * Load a red cube texture and create robot mesh
   */
  async initializeRobotMesh(): Promise<void> {
    try {
      // Try to load a red texture, fallback to solid color
      let redMaterial: THREE.Material;

      try {
        const redTexture = await this.textureLoader.loadAsync('/assets/red-texture.png');
        redTexture.magFilter = THREE.NearestFilter;
        redTexture.minFilter = THREE.NearestFilter;
        redMaterial = new THREE.MeshPhongMaterial({
          map: redTexture,
          emissive: 0xff0000,
          emissiveIntensity: 0.2,
          shininess: 100,
        });
      } catch {
        // Fallback: create solid red material
        console.warn('Could not load red texture, using solid red color');
        redMaterial = new THREE.MeshPhongMaterial({
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 0.3,
          shininess: 100,
        });
      }

      // Create main robot cube
      const cubeGeometry = new THREE.BoxGeometry(
        this.robotScale,
        this.robotScale,
        this.robotScale
      );
      this.robotMesh = new THREE.Mesh(cubeGeometry, redMaterial);
      this.robotMesh.name = 'RobotCube';
      this.robotMesh.castShadow = true;
      this.robotMesh.receiveShadow = true;

      this.group.add(this.robotMesh);

      // Create direction arrow to show robot orientation
      this.createDirectionArrow();

      console.log('Robot mesh initialized');
    } catch (error) {
      console.error('Error initializing robot mesh:', error);
    }
  }

  /**
   * Create a visual arrow/cone to show robot heading direction
   */
  private createDirectionArrow(): void {
    const arrowMaterial = new THREE.MeshPhongMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
    });

    // Create a cone pointing forward (positive Y direction)
    const coneGeometry = new THREE.ConeGeometry(0.15, 0.3, 8);
    this.directionArrow = new THREE.Mesh(coneGeometry, arrowMaterial);
    this.directionArrow.position.y = this.robotScale / 2 + 0.15;
    this.directionArrow.name = 'RobotArrow';
    this.directionArrow.castShadow = true;
    this.directionArrow.receiveShadow = true;

    this.group.add(this.directionArrow);
  }

  /**
   * Update robot position and rotation based on pose
   */
  updatePose(x: number, y: number, z: number, yaw: number): void {
    // Position the robot at the given coordinates
    this.group.position.set(x, z, -y); // Note: Z is up in Three.js, Y is forward

    // Rotate the robot around the Z axis based on yaw angle
    // In ROS, positive yaw is counter-clockwise (Z-up)
    // In Three.js, positive rotation is counter-clockwise around Z
    this.group.rotation.z = yaw;

    // Keep the robot upright (no roll or pitch)
    this.group.rotation.x = 0;
    this.group.rotation.y = 0;
  }

  /**
   * Show/hide the robot visualizer
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Get the robot group for additional manipulation
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Dispose of all Three.js resources
   */
  dispose(): void {
    // Dispose geometries and materials
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }

  /**
   * Get current robot position
   */
  getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /**
   * Get current robot rotation (yaw in radians)
   */
  getYaw(): number {
    return this.group.rotation.z;
  }
}
