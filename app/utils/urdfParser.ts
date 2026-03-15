/**
 * URDF Robot Dimensions Parser
 * Extracts robot body and wheel dimensions from URDF files
 */

export interface RobotDimensions {
  bodyRadius: number;
  bodyHeight: number;
  wheelRadius: number;
  wheelThickness: number;
  wheelBase: number;
  robotName: string;
  scale?: number; // Scale factor for Gazebo compatibility (1.0 = no scaling)
}

// TurtleBot3 Burger dimensions (meters) from URDF
export const TURTLEBOT3_BURGER: RobotDimensions = {
  robotName: 'TurtleBot3 Burger',
  bodyRadius: 0.105,      // width/2 = 0.21/2
  bodyHeight: 0.192,      // height from ground to top
  wheelRadius: 0.033,     // wheel radius
  wheelThickness: 0.02,   // wheel thickness/width
  wheelBase: 0.16,        // distance between wheels
  scale: 1.0,             // No scaling needed
};

// TurtleBot3 Waffle dimensions
export const TURTLEBOT3_WAFFLE: RobotDimensions = {
  robotName: 'TurtleBot3 Waffle',
  bodyRadius: 0.15,
  bodyHeight: 0.24,
  wheelRadius: 0.0475,
  wheelThickness: 0.032,
  wheelBase: 0.287,
  scale: 1.0,
};

// Generic robot dimensions
export const GENERIC_ROBOT: RobotDimensions = {
  robotName: 'Generic Robot',
  bodyRadius: 0.2,
  bodyHeight: 0.3,
  wheelRadius: 0.05,
  wheelThickness: 0.03,
  wheelBase: 0.25,
  scale: 1.0,
};

export const ROBOT_DIMENSIONS: Record<string, RobotDimensions> = {
  'turtlebot3_burger': TURTLEBOT3_BURGER,
  'turtlebot3_waffle': TURTLEBOT3_WAFFLE,
  'generic': GENERIC_ROBOT,
};

/**
 * Parse URDF XML and extract robot dimensions
 * @param urdfContent - URDF XML content as string
 * @returns RobotDimensions object
 */
export function parseURDFDimensions(urdfContent: string): RobotDimensions {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(urdfContent, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      console.error('URDF parsing error, using default dimensions');
      return GENERIC_ROBOT;
    }

    // Extract robot name
    const robotElement = xmlDoc.getElementsByTagName('robot')[0];
    const robotName = robotElement?.getAttribute('name') || 'Unknown Robot';

    // Look for link dimensions
    let bodyRadius = 0.1;
    let bodyHeight = 0.2;
    let wheelRadius = 0.03;
    let wheelThickness = 0.02;
    let wheelBase = 0.16;

    // Parse all links to find body and wheel dimensions
    const links = xmlDoc.getElementsByTagName('link');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const linkName = link.getAttribute('name');
      const inertial = link.getElementsByTagName('inertial')[0];
      const visual = link.getElementsByTagName('visual')[0];

      if (visual) {
        const geometry = visual.getElementsByTagName('geometry')[0];
        const cylinder = geometry?.getElementsByTagName('cylinder')[0];
        const box = geometry?.getElementsByTagName('box')[0];

        // Extract body dimensions (usually called "base_link" or "chassis")
        if (
          linkName &&
          (linkName.includes('base') || linkName.includes('chassis'))
        ) {
          if (box) {
            const sizeStr = box.getAttribute('size');
            if (sizeStr) {
              const [x, y, z] = sizeStr.split(' ').map(Number);
              bodyRadius = Math.max(x, y) / 2;
              bodyHeight = z;
            }
          }
        }

        // Extract wheel dimensions (usually called "wheel_link")
        if (linkName && linkName.includes('wheel')) {
          if (cylinder) {
            const radius = cylinder.getAttribute('radius');
            const length = cylinder.getAttribute('length');
            if (radius) wheelRadius = parseFloat(radius);
            if (length) wheelThickness = parseFloat(length);
          }
        }
      }
    }

    // Parse joints to find wheel base
    const joints = xmlDoc.getElementsByTagName('joint');
    const wheelPositions: number[] = [];

    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i];
      const origin = joint.getElementsByTagName('origin')[0];
      if (origin) {
        const yPos = origin.getAttribute('y');
        if (yPos) {
          wheelPositions.push(Math.abs(parseFloat(yPos)));
        }
      }
    }

    if (wheelPositions.length > 0) {
      wheelBase = Math.max(...wheelPositions) * 2;
    }

    return {
      robotName,
      bodyRadius,
      bodyHeight,
      wheelRadius,
      wheelThickness,
      wheelBase,
    };
  } catch (error) {
    console.error('Error parsing URDF:', error);
    return GENERIC_ROBOT;
  }
}

/**
 * Load URDF from URL/file path
 * @param urdfPath - Path to URDF file
 * @returns Promise<RobotDimensions>
 */
export async function loadURDFDimensions(urdfPath: string): Promise<RobotDimensions> {
  try {
    // Check if it's a known robot type
    if (ROBOT_DIMENSIONS[urdfPath]) {
      return ROBOT_DIMENSIONS[urdfPath];
    }

    // Try to load from file
    const response = await fetch(urdfPath);
    const urdfContent = await response.text();
    return parseURDFDimensions(urdfContent);
  } catch (error) {
    console.error('Error loading URDF file:', error);
    return GENERIC_ROBOT;
  }
}

/**
 * Get robot dimensions by name
 * @param robotName - Robot name or identifier
 * @returns RobotDimensions
 */
export function getRobotDimensions(robotName: string = 'generic'): RobotDimensions {
  return ROBOT_DIMENSIONS[robotName.toLowerCase()] || GENERIC_ROBOT;
}

/**
 * Apply scale factor to robot dimensions
 * @param dimensions - Original robot dimensions
 * @param scale - Scale factor (e.g., 1.5 to make 50% larger)
 * @returns Scaled robot dimensions
 */
export function scaleRobotDimensions(dimensions: RobotDimensions, scale: number): RobotDimensions {
  return {
    ...dimensions,
    bodyRadius: dimensions.bodyRadius * scale,
    bodyHeight: dimensions.bodyHeight * scale,
    wheelRadius: dimensions.wheelRadius * scale,
    wheelThickness: dimensions.wheelThickness * scale,
    wheelBase: dimensions.wheelBase * scale,
    scale: scale,
  };
}

/**
 * Calculate scale factor based on map resolution vs URDF dimensions
 * @param mapResolution - Map resolution in meters/pixel
 * @param urdfDimensions - Robot dimensions from URDF
 * @returns Recommended scale factor
 */
export function calculateOptimalScale(mapResolution: number, urdfDimensions: RobotDimensions): number {
  // If map is very coarse, we might need to scale robot visually
  // Recommended minimum pixels for robot body: 20 pixels
  const minPixelsPerMeter = 20;
  const pixelsPerMeter = 1 / mapResolution;
  
  if (pixelsPerMeter < minPixelsPerMeter) {
    return minPixelsPerMeter / pixelsPerMeter;
  }
  
  return 1.0;
}
