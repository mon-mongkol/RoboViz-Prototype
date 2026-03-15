"use client"
import { useEffect, useState } from "react"
import { useROS } from "@/app/context/ROSContext"
import { checkSLAM } from "@/app/lib/ros/check-slam"

export  default function RosDataContext () {

  const { ros, connected } = useROS()

  const [slamType, setSlamType] = useState<string | null>(null)

  useEffect(() => {

    if (!ros || !connected) return

    checkSLAM(ros).then((res: any) => {
      if (res.slamToolbox) setSlamType("slam_toolbox")
      else if (res.cartographer) setSlamType("cartographer")
      else if (res.gmapping) setSlamType("gmapping")
      else setSlamType("navigation")
    })

  }, [ros, connected])

  return { ros, connected, slamType }

  //   return (
  //     <p>
  //       ROS: {connected ? "connected" : "disconnected"}
  //       Mode : {slamType ? <span>{slamType}</span> : "unknown"}
  //     </p>
  // )

  // return slamType
}