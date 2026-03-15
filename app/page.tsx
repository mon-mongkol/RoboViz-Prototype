"use client"
import IsometricMap from "@/app/componets/IsometricMap";
import RosDataContext from "@/app/hooks/ContextData_RosStatus";
import { RosStatus } from "./componets/RosStatus";
import ThreeScene from "./componets/ThreeScene";
import IsometricMapDemo from "@/app/componets/IsometricMap";
export default function Home() {
  const { ros, connected, slamType } = RosDataContext();

  return (
    <div>
      <RosStatus 
        ros={ros}
        connected={connected}
        slamType={slamType}
      />
      {/* <ThreeScene /> */}
      <IsometricMapDemo />
      {/* <IsometricMap 
        ros={ros}
        connected={connected}
        slamType={slamType}
      /> */}
      {/* <MapCanvas /> */}
      {/* <MapCanvas
        width={800}
        height={600}
        cellSize={50}
        gridColor="#444"
      /> */}
    </div>
  );
}
