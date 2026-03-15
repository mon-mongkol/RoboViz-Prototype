import * as ROSLIB from "roslib"

export async function checkSLAM(ros: ROSLIB.Ros) {

  if (!ros) {
    console.error("ROS instance is null")
    return
  }

  return new Promise((resolve, reject) => {

    const service = new ROSLIB.Service({
      ros: ros,
      name: "/rosapi/nodes",
      serviceType: "rosapi/Nodes"
    })

    service.callService({}, (result: any) => {

      const nodes: string[] = result.nodes || []

      console.log("Detected ROS nodes:", nodes)

      const slamToolbox = nodes.some(n => n.includes("slam_toolbox"))
      const cartographer = nodes.some(n => n.includes("cartographer"))
      const gmapping = nodes.some(n => n.includes("/turtlebot3_slam_gmapping"))

      resolve({
        slamToolbox,
        cartographer,
        gmapping
      })

    }, (error) => {

      console.error("Service error:", error)
      reject(error)

    })

  })
}