const rotation = quaternionToYawDeg(robotPose.orientation)

<Image
  image={robotImg}
  x={robotX}
  y={robotY}
  rotation={rotation}
/>

const pos = rosToCanvas(
  pose.position.x,
  pose.position.y,
  50,
  400,
  300
)



const pos = rosToCanvas(
  pose.position.x,
  pose.position.y,
  50,
  400,
  300
)


onClick={(e) => {
  const pos = e.target.getStage()?.getPointerPosition()

  const goal = canvasToRos(
    pos.x,
    pos.y,
    50,
    400,
    300
  )

  console.log("goal", goal)
}}