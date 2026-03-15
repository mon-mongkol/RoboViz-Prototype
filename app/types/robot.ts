/**
 * Type definitions for Robot Pose and TF Transform data
 */

export interface TransformStamped {
  header: {
    seq: number;
    stamp: {
      secs: number;
      nsecs: number;
    };
    frame_id: string;
  };
  child_frame_id: string;
  transform: {
    translation: {
      x: number;
      y: number;
      z: number;
    };
    rotation: {
      x: number;
      y: number;
      z: number;
      w: number;
    };
  };
}

export interface RobotState {
  timestamp: number;
  frameId: string;
  childFrameId: string;
  pose: {
    position: {
      x: number;
      y: number;
      z: number;
    };
    orientation: {
      roll: number;  // rotation around X
      pitch: number; // rotation around Y
      yaw: number;   // rotation around Z
    };
    quaternion: {
      x: number;
      y: number;
      z: number;
      w: number;
    };
  };
  velocity?: {
    linear: {
      x: number;
      y: number;
      z: number;
    };
    angular: {
      x: number;
      y: number;
      z: number;
    };
  };
}

export interface RobotTrajectoryPoint {
  timestamp: number;
  pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
  };
}

export interface MapInfo {
  resolution: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export interface LocalizationStatus {
  initialized: boolean;
  numParticles: number;
  poseUncertainty?: {
    x: number;
    y: number;
    theta: number;
  };
}

export interface SLAMStatus {
  nodeType: 'slam_toolbox' | 'cartographer' | 'gmapping' | 'unknown';
  isRunning: boolean;
  mapSize?: {
    width: number;
    height: number;
  };
  processingTime?: number;
}

export interface VisualizationOptions {
  showRobot: boolean;
  showTrajectory: boolean;
  showUncertainty: boolean;
  showScanMatches: boolean;
  robotScale: number;
  trajectoryLength: number;
  colorScheme: 'dark' | 'light';
}
