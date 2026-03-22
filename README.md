export TURTLEBOT3_MODEL=burger

ros2 launch turtlebot3_gazebo turtlebot3_world.launch.py

ros2 launch turtlebot3_cartographer cartographer.launch.py use_sim_time:=true

ros2 run turtlebot3_teleop teleop_keyboard


ros2 launch turtlebot3_navigation2 navigation2.launch.py use_sim_time:=true map:=/home/meownani/Desktop/ros-web-robotic/map/ilab.yaml


ros2 launch turtlebot3_navigation2 navigation2_rviz.launch.py


ros2 launch rosbridge_server rosbridge_websocket_launch.xml


      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        draggable
        onMouseMove={handleMouseMove}
      >

        <Layer>

          {/* <Image
            image={mapImage}
            width={stageWidth}
            height={
            
            stageHeight}
          /> */}

          <Image
            image={mapImage}
            x={mapOffsetX * cellSize}
            y={-mapOffsetY * cellSize}
            width={stageWidth}
            height={stageHeight}
            scaleY={-1}
          />

        </Layer>

      </Stage>

export TURTLEBOT3_MODEL=burger
source /opt/ros/noetic/setup.bash
roslaunch turtlebot3_teleop turtlebot3_teleop_key.launch
roslaunch turtlebot3_gazebo turtlebot3_world.launch
roslaunch rosbridge_server rosbridge_websocket.launch

roslaunch turtlebot3_slam turtlebot3_slam.launch slam_methods:=gmapping use_sim_time:=true

rosrun tf2_web_republisher tf2_web_republisher

xhost +local:docker

roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=/root/firmware_update/map/my_map.yaml