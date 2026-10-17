export type Vec3 = [number, number, number]

export type ObjType = 'tree' | 'pine' | 'rock' | 'house' | 'tower' | 'island' | 'bench' | 'lamp'

export interface WorldObject {
  id: string
  type: ObjType
  /** rest position (world space). Ground objects sit on the terrain; islands float. */
  pos: Vec3
  rotY: number
  scale: number
  variant: number
  /** user asked this object to float up ("漂起") */
  floating?: boolean
}

export interface CloudObject {
  id: string
  pos: Vec3
  scale: number
  seed: number
}

export type WeatherId = 'clear' | 'cloudy' | 'mist' | 'sunset' | 'starry'

/** Everything that defines a world; JSON-serialisable, saved and shared as-is. */
export interface WorldDoc {
  v: 1
  name: string
  time: number
  weather: WeatherId
  /** 1 = normal, 0 = weightless, -1 = reversed */
  gravity: number
  orbit: boolean
  objects: WorldObject[]
  clouds: CloudObject[]
  /** auto time-of-day playback: on/off and game minutes per real second */
  play?: { on: boolean; rate: number }
  /** calendar day index for cloud layout; advances when time crosses midnight */
  day?: number
}

export type Panel = 'weather' | 'add' | 'gravity' | 'camera' | 'save' | 'share' | null
