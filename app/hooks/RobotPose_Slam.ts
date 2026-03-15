"use client"
import { useEffect, useState } from "react"
import * as ROSLIB from "roslib"

type RobotPoseData = {
  x: number
  y: number
  z: number
  yaw: number
}

type TFClientStats = {
  isConnected: boolean
  fixedFrame: string
  targetFrame: string
  updateRate: number
  lastUpdate: number
  totalUpdates: number
}

type RosProps = {
  ros: any
  connected: boolean
}

export function useRobotPose({ ros, connected }: RosProps) {
  const [robotPose, setRobotPose] = useState<RobotPoseData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tfStats, setTfStats] = useState<TFClientStats>({
    isConnected: false,
    fixedFrame: 'map',
    targetFrame: 'base_link',
    updateRate: 10,
    lastUpdate: 0,
    totalUpdates: 0,
  })

  useEffect(() => {
    if (!ros || !connected) {
      console.log('⚠️ ROS not ready:', { ros: !!ros, connected })
      setTfStats(prev => ({ ...prev, isConnected: false }))
      return
    }

    try {
      console.log('✅ Starting TF subscription...')

      const tfClient = new ROSLIB.TFClient({
        ros: ros,
        fixedFrame: 'map',
        angularThres: 0.01,
        transThres: 0.01,
        rate: 10,
      })
      
      console.log('📍 TFClient created')
      setTfStats(prev => ({ ...prev, isConnected: true }))

      tfClient.subscribe('base_link', (tf) => {
        const x = tf.translation.x
        const y = tf.translation.y
        const z = tf.translation.z

        const q = tf.rotation
        const yaw = Math.atan2(
          2.0 * (q.w * q.z + q.x * q.y),
          1.0 - 2.0 * (q.y * q.y + q.z * q.z)
        )

        const poseData = { x, y, z, yaw }
        setRobotPose(poseData)
        
        // Update stats
        setTfStats(prev => ({
          ...prev,
          lastUpdate: Date.now(),
          totalUpdates: prev.totalUpdates + 1,
        }))

        // Real-time console logging with formatting
        console.log('🤖 Real-time Robot Pose Update:')
        console.log(`   X: ${x.toFixed(4)} m`)
        console.log(`   Y: ${y.toFixed(4)} m`)
        console.log(`   Z: ${z.toFixed(4)} m`)
        console.log(`   Yaw: ${(yaw * 180 / Math.PI).toFixed(2)}° (${yaw.toFixed(4)} rad)`)
        console.log(`   Update #${tfStats.totalUpdates + 1} at ${new Date().toLocaleTimeString()}`)
      })

      return () => {
        console.log('🛑 Unsubscribing from TF...')
        tfClient.unsubscribe('base_link')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      console.error('❌ TF Client error:', err)
      setTfStats(prev => ({ ...prev, isConnected: false }))
    }
  }, [ros, connected])

  return { robotPose, error, tfStats }
}