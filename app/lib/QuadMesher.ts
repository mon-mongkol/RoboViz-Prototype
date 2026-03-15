/**
 * Quad Mesher - Minecraft-style mesh optimization
 * 
 * This implements the quad mashing algorithm from:
 * https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/
 * 
 * The algorithm merges adjacent faces into larger quads to reduce draw calls
 * and vertex count, significantly improving performance.
 */

export interface Quad {
  x: number;
  y: number;
  width: number;
  height: number;
  normal: { x: number; y: number; z: number };
  faceAxis: 'x' | 'y' | 'z'; // Which axis the quad face is on
  depth: number; // Position along the normal axis
}

export interface VoxelMesh {
  vertices: number[];
  indices: number[];
  textureUVs: number[];
}

/**
 * Compare two quads for sorting during mashing
 * Pseudo code from 0fps.net:
 *   compareQuads( (x0, y0, w0, h0), (x1, y1, w1, h1) ):
 *        if ( y0 != y1 )   return y0 < y1
 *        if ( x0 != x1 )   return x0 < x1
 *        if ( w0 != w1 )   return w0 > w1
 *        return h0 >= h1
 */
function compareQuads(a: Quad, b: Quad): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  if (a.width !== b.width) return b.width - a.width;
  return b.height - a.height;
}

/**
 * Check if two quads can be merged horizontally (along x-axis)
 */
function canMergeHorizontal(q1: Quad, q2: Quad): boolean {
  return (
    q1.y === q2.y &&
    q1.height === q2.height &&
    q1.faceAxis === q2.faceAxis &&
    q1.depth === q2.depth &&
    q1.normal.x === q2.normal.x &&
    q1.normal.y === q2.normal.y &&
    q1.normal.z === q2.normal.z &&
    q1.x + q1.width === q2.x // Adjacent horizontally
  );
}

/**
 * Check if two quads can be merged vertically (along y-axis)
 */
function canMergeVertical(q1: Quad, q2: Quad): boolean {
  return (
    q1.x === q2.x &&
    q1.width === q2.width &&
    q1.faceAxis === q2.faceAxis &&
    q1.depth === q2.depth &&
    q1.normal.x === q2.normal.x &&
    q1.normal.y === q2.normal.y &&
    q1.normal.z === q2.normal.z &&
    q1.y + q1.height === q2.y // Adjacent vertically
  );
}

/**
 * Merge quads horizontally
 */
function mergeHorizontal(q1: Quad, q2: Quad): Quad {
  return {
    ...q1,
    width: q1.width + q2.width,
  };
}

/**
 * Merge quads vertically
 */
function mergeVertical(q1: Quad, q2: Quad): Quad {
  return {
    ...q1,
    height: q1.height + q2.height,
  };
}

/**
 * Mash (merge) quads to reduce the total number of faces
 * This is the main optimization algorithm
 */
export function mashQuads(quads: Quad[]): Quad[] {
  if (quads.length === 0) return [];

  // Sort quads using the comparison function from 0fps
  const sorted = [...quads].sort(compareQuads);

  const mashed: Quad[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Try to merge horizontally first
    if (canMergeHorizontal(current, next)) {
      current = mergeHorizontal(current, next);
    }
    // Try to merge vertically if horizontal merge failed
    else if (canMergeVertical(current, next)) {
      current = mergeVertical(current, next);
    }
    // Can't merge, save current and start a new one
    else {
      mashed.push(current);
      current = next;
    }
  }

  // Don't forget the last quad
  mashed.push(current);

  return mashed;
}

/**
 * Convert a voxel grid to quads for a specific face direction
 * This extracts visible faces and creates quads for them
 */
export function extractQuadsForFace(
  voxelGrid: boolean[][][], // 3D grid of occupied voxels
  width: number,
  height: number,
  depth: number,
  faceAxis: 'x' | 'y' | 'z'
): Quad[] {
  const quads: Quad[] = [];
  const visited: boolean[][][] = Array(width)
    .fill(null)
    .map(() =>
      Array(height)
        .fill(null)
        .map(() => Array(depth).fill(false))
    );

  if (faceAxis === 'z') {
    // Quads on the z-axis faces
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!visited[x][y][z] && voxelGrid[x][y][z]) {
            // Greedy: expand quad as much as possible
            let w = 1;
            let h = 1;

            // Expand width
            while (
              x + w < width &&
              !visited[x + w][y][z] &&
              voxelGrid[x + w][y][z]
            ) {
              w++;
            }

            // Expand height
            outerLoop: while (y + h < height) {
              for (let dx = 0; dx < w; dx++) {
                if (
                  visited[x + dx][y + h][z] ||
                  !voxelGrid[x + dx][y + h][z]
                ) {
                  break outerLoop;
                }
              }
              h++;
            }

            // Mark as visited
            for (let dx = 0; dx < w; dx++) {
              for (let dy = 0; dy < h; dy++) {
                visited[x + dx][y + dy][z] = true;
              }
            }

            quads.push({
              x,
              y,
              width: w,
              height: h,
              depth: z,
              faceAxis: 'z',
              normal: { x: 0, y: 0, z: 1 },
            });
          }
        }
      }
    }
  } else if (faceAxis === 'y') {
    // Quads on the y-axis faces
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          if (!visited[x][y][z] && voxelGrid[x][y][z]) {
            let w = 1;
            let d = 1;

            while (
              x + w < width &&
              !visited[x + w][y][z] &&
              voxelGrid[x + w][y][z]
            ) {
              w++;
            }

            outerLoop2: while (z + d < depth) {
              for (let dx = 0; dx < w; dx++) {
                if (
                  visited[x + dx][y][z + d] ||
                  !voxelGrid[x + dx][y][z + d]
                ) {
                  break outerLoop2;
                }
              }
              d++;
            }

            for (let dx = 0; dx < w; dx++) {
              for (let dz = 0; dz < d; dz++) {
                visited[x + dx][y][z + dz] = true;
              }
            }

            quads.push({
              x,
              y,
              width: w,
              height: d,
              depth: y,
              faceAxis: 'y',
              normal: { x: 0, y: 1, z: 0 },
            });
          }
        }
      }
    }
  } else if (faceAxis === 'x') {
    // Quads on the x-axis faces
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
          if (!visited[x][y][z] && voxelGrid[x][y][z]) {
            let h = 1;
            let d = 1;

            while (
              y + h < height &&
              !visited[x][y + h][z] &&
              voxelGrid[x][y + h][z]
            ) {
              h++;
            }

            outerLoop3: while (z + d < depth) {
              for (let dy = 0; dy < h; dy++) {
                if (
                  visited[x][y + dy][z + d] ||
                  !voxelGrid[x][y + dy][z + d]
                ) {
                  break outerLoop3;
                }
              }
              d++;
            }

            for (let dy = 0; dy < h; dy++) {
              for (let dz = 0; dz < d; dz++) {
                visited[x][y + dy][z + dz] = true;
              }
            }

            quads.push({
              x: y,
              y: z,
              width: h,
              height: d,
              depth: x,
              faceAxis: 'x',
              normal: { x: 1, y: 0, z: 0 },
            });
          }
        }
      }
    }
  }

  return quads;
}

/**
 * Convert mashed quads to Three.js mesh data
 */
export function quadsToMesh(
  quads: Quad[],
  cellSize: number = 1,
  height: number = 1
): VoxelMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const textureUVs: number[] = [];

  let vertexIndex = 0;

  for (const quad of quads) {
    // Create vertices for the quad
    // Corner positions depend on the face axis
    let corners: [number, number, number][] = [];

    if (quad.faceAxis === 'z') {
      const x0 = quad.x * cellSize;
      const x1 = (quad.x + quad.width) * cellSize;
      const y0 = quad.y * height;
      const y1 = (quad.y + quad.height) * height;
      const z = quad.depth * cellSize;

      corners = [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ];
    } else if (quad.faceAxis === 'y') {
      const x0 = quad.x * cellSize;
      const x1 = (quad.x + quad.width) * cellSize;
      const y = quad.depth * height;
      const z0 = quad.y * cellSize;
      const z1 = (quad.y + quad.height) * cellSize;

      corners = [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
      ];
    } else if (quad.faceAxis === 'x') {
      const x = quad.depth * cellSize;
      const y0 = quad.x * height;
      const y1 = (quad.x + quad.width) * height;
      const z0 = quad.y * cellSize;
      const z1 = (quad.y + quad.height) * cellSize;

      corners = [
        [x, y0, z0],
        [x, y1, z0],
        [x, y1, z1],
        [x, y0, z1],
      ];
    }

    // Add vertices
    for (const corner of corners) {
      vertices.push(...corner);
    }

    // Add indices for the quad (two triangles)
    const i = vertexIndex;
    indices.push(i, i + 1, i + 2); // First triangle
    indices.push(i, i + 2, i + 3); // Second triangle

    // Add texture coordinates
    textureUVs.push(0, 0, 1, 0, 1, 1, 0, 1);

    vertexIndex += 4;
  }

  return {
    vertices,
    indices,
    textureUVs,
  };
}

/**
 * Main function: Convert voxel grid to optimized Three.js mesh
 */
export function createOptimizedVoxelMesh(
  voxelGrid: boolean[][][],
  width: number,
  height: number,
  depth: number,
  cellSize: number = 1
): VoxelMesh {
  // Extract quads for all visible faces
  const quadsZ = extractQuadsForFace(voxelGrid, width, height, depth, 'z');
  const quadsY = extractQuadsForFace(voxelGrid, width, height, depth, 'y');
  const quadsX = extractQuadsForFace(voxelGrid, width, height, depth, 'x');

  // Mash quads for each face direction
  const mashedZ = mashQuads(quadsZ);
  const mashedY = mashQuads(quadsY);
  const mashedX = mashQuads(quadsX);

  // Combine all quads
  const allQuads = [...mashedZ, ...mashedY, ...mashedX];

  console.log(`Quad Mashing Stats:
    Original quads: ${quadsZ.length + quadsY.length + quadsX.length}
    Mashed quads: ${allQuads.length}
    Reduction: ${(((quadsZ.length + quadsY.length + quadsX.length - allQuads.length) / (quadsZ.length + quadsY.length + quadsX.length)) * 100).toFixed(2)}%
  `);

  // Convert to Three.js mesh
  return quadsToMesh(allQuads, cellSize, cellSize);
}
