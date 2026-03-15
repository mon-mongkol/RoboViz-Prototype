/**
 * VoxelMesher - Converts voxel data to optimized Three.js meshes
 * Uses quad mashing algorithm from Minecraft for maximum performance
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createOptimizedVoxelMesh, mashQuads, extractQuadsForFace } from './QuadMesher';

export interface VoxelData {
  width: number;
  height: number;
  depth: number;
  data: boolean[][][]; // 3D array of occupied voxels
}

export interface MeshResult {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  mesh: THREE.Mesh;
}

/**
 * Create a Three.js mesh from voxel data with quad mashing optimization
 */
export function createVoxelMesh(
  voxelData: VoxelData,
  texture?: THREE.Texture,
  cellSize: number = 1
): MeshResult {
  const { width, height, depth, data } = voxelData;

  // Generate optimized mesh using quad mashing
  const meshData = createOptimizedVoxelMesh(data, width, height, depth, cellSize);

  // Create Three.js geometry
  const geometry = new THREE.BufferGeometry();

  // Add positions
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(meshData.vertices), 3)
  );

  // Add indices
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.indices), 1));

  // Add UVs
  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array(meshData.textureUVs), 2)
  );

  // Compute normals for lighting
  geometry.computeVertexNormals();

  // Create material
  const material = new THREE.MeshPhongMaterial({
    map: texture,
    side: THREE.FrontSide,
    flatShading: false, // Use smooth shading for better visuals
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);

  return { geometry, material, mesh };
}

/**
 * Convert occupancy grid data to voxel format
 */
export function occupancyGridToVoxels(
  occupancyData: number[],
  width: number,
  height: number,
  occupiedThreshold: number = 50
): VoxelData {
  const data: boolean[][][] = Array(width)
    .fill(null)
    .map(() =>
      Array(height)
        .fill(null)
        .map(() => Array(1).fill(false))
    );

  for (let i = 0; i < occupancyData.length && i < width * height; i++) {
    const row = Math.floor(i / width);
    const col = i % width;

    if (row < height && col < width) {
      // Consider occupied if value is above threshold (0-100 scale)
      data[col][row][0] = occupancyData[i] > occupiedThreshold;
    }
  }

  return {
    width,
    height,
    depth: 1,
    data,
  };
}

/**
 * Create a batch mesh from multiple voxel regions
 * Useful for creating large scenes with many voxel groups
 */
export function createBatchVoxelMeshes(
  regions: VoxelData[],
  texture?: THREE.Texture,
  cellSize: number = 1
): MeshResult[] {
  return regions.map((region) => createVoxelMesh(region, texture, cellSize));
}

/**
 * Merge multiple meshes into a single mesh for better performance
 */
export function mergeMeshes(meshes: MeshResult[]): MeshResult {
  if (meshes.length === 0) {
    throw new Error('No meshes to merge');
  }

  if (meshes.length === 1) {
    return meshes[0];
  }

  const geometries: THREE.BufferGeometry[] = [];

  for (const meshResult of meshes) {
    geometries.push(meshResult.geometry);
  }

  const mergedGeometry = mergeGeometries(geometries);
  mergedGeometry.computeVertexNormals();

  const material = meshes[0].material;
  const mesh = new THREE.Mesh(mergedGeometry, material);

  return { geometry: mergedGeometry, material, mesh };
}
