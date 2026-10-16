import { ISLANDS, heroClouds, roadX, terrainHeight, ROAD_WIDTH } from '../world/layout'
import type { WorldDoc, WorldObject } from './types'

const ground = (x: number, z: number) => terrainHeight(x, z)

export function defaultWorld(): WorldDoc {
  const objects: WorldObject[] = [
    ...ISLANDS.map((s, i): WorldObject => ({ id: `island-${i}`, type: 'island', pos: [...s.pos], rotY: 0, scale: 1, variant: i })),
  ]
  const side = (z: number, off: number) => roadX(z) + off
  const place = (id: string, type: WorldObject['type'], x: number, z: number, rotY = 0, scale = 1, variant = 0) =>
    objects.push({ id, type, pos: [x, ground(x, z), z], rotY, scale, variant })
  place('bench-0', 'bench', side(4, -(ROAD_WIDTH / 2 + 2.1)), 4, Math.PI / 2, 1.1)
  place('rock-0', 'rock', side(-6, 13), -6, 0.6, 1.6, 0)
  place('rock-1', 'rock', side(-2, 15.5), -2, 2.1, 0.9, 1)
  place('house-0', 'house', side(-40, 26), -40, -0.5, 1.6, 0)
  place('tower-0', 'tower', side(-62, -30), -62, 0.3, 1.5, 1)
  place('tree-0', 'tree', side(-34, 20), -34, 0, 1.4, 1)
  place('pine-0', 'pine', side(-46, 33), -46, 0, 1.3, 0)
  return {
    v: 1,
    name: '我的世界',
    time: 8,
    weather: 'clear',
    gravity: 1,
    orbit: false,
    objects,
    clouds: heroClouds().map((c, i) => ({ id: `cloud-${i}`, pos: [...c.pos], scale: c.scale, seed: c.seed })),
  }
}
