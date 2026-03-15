"use client"
import RosDataContext from "@/app/hooks/ContextData_RosStatus";
// import { checkSLAM } from '@/app/lib/ros/check-slam';

type RosStatusViewProps = {
  ros: any;
  connected: boolean;
  slamType: string | null;
};


export function RosStatus({
  ros,
  connected,
  slamType
}: RosStatusViewProps) {
  {
    // const { ros, connected, slamType } = RosDataContext();

    return (
      <p>
        ROS: {connected ? "connected" : "disconnected"}
        Mode : {slamType ? <span>{slamType}</span> : "unknown"}
      </p>
    );
  }
}
