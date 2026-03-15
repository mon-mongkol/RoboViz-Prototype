"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import * as ROSLIB from "roslib"


interface ROSContextType {
  ros: ROSLIB.Ros | null
  connected: boolean
}

const ROSContext = createContext<ROSContextType>({
  ros: null,
  connected: false,
})

export const ROSProvider = ({ children }: { children: ReactNode }) => {

  const [ros, setRos] = useState<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)


  useEffect(() => {

    const rosInstance = new ROSLIB.Ros({
      url: "ws://127.0.0.1:9090"
    })

    rosInstance.on("connection", () => {
      setConnected(true)

      
    })

    rosInstance.on("close", () => {
      setConnected(false)
    })

    setRos(rosInstance)

    return () => rosInstance.close()

  }, [])

  return (
    <ROSContext.Provider value={{ ros, connected }}>
      {children}
    </ROSContext.Provider>
  )
}

export const useROS = () => useContext(ROSContext)