export interface GridResult {
  width: number
  height: number
  pixels: Uint8ClampedArray
  originX: number
  originY: number
  resolution: number
}

export function processOccupancyGrid(message: any): GridResult {

  const width = message.info.width
  const height = message.info.height

  const pixels = new Uint8ClampedArray(width * height * 4)

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {

      const mapIndex = c + ((height - r - 1) * width)
      const value = message.data[mapIndex]

      let color = 127
      if (value === 0) color = 255
      if (value === 100) color = 0

      const i = (r * width + c) * 4

      pixels[i] = color
      pixels[i + 1] = color
      pixels[i + 2] = color
      pixels[i + 3] = 255
    }
  }

  return {
    width,
    height,
    pixels,
    originX: message.info.origin.position.x,
    originY: message.info.origin.position.y,
    resolution: message.info.resolution
  }
}