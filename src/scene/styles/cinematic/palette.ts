import type { WorldPalette } from '../../../world/geometry'
import type { LightKey } from '../../../world/palette'

export const paletteA: WorldPalette = {
  grassA: '#579a36', grassB: '#8cb646', grassDry: '#b8ae5a', grassFar: '#8fb488',
  dirt: '#7a6248', rock: '#8d7c6c', rockDark: '#4c4450',
  road: '#b9a283', roadLine: '#b4a78f', curb: '#7d8150',
  trunk: '#5a4332', leaf: ['#4c7a2c', '#6a8e34', '#3d6a33'], conifer: '#2e5938',
  wall: ['#f1e9dc', '#ecdcc6', '#f6f1e8'], roof: ['#b5553e', '#5b788b', '#a5653f'],
  cityA: '#d2d7dd', cityB: '#9faab8', cityTop: '#eef0f2',
  mountain: '#8a98aa', mountainSnow: '#f6f8fb', water: '#9cc8e6',
}

/** Lighting keys: midday sun near white; warm only at low elevation. Soft blue-grey fog (not chalk, not zero). */
export const lightKeysA: LightKey[] = [
  { elev: -14, sun: '#b8cdf4', sunI: 0.9, skyTop: '#0a1638', skyHorizon: '#223a6c', hemiSky: '#5a7fc4', hemiGround: '#1a1f3e', hemiI: 1.0, fog: '#1d3158' },
  { elev: -4, sun: '#ff8a5a', sunI: 0.0, skyTop: '#26386b', skyHorizon: '#e07a62', hemiSky: '#6a62a6', hemiGround: '#33283f', hemiI: 0.6, fog: '#6f6886' },
  { elev: 1, sun: '#ff7a38', sunI: 1.9, skyTop: '#46699f', skyHorizon: '#ff9a68', hemiSky: '#9a92d4', hemiGround: '#5c4658', hemiI: 1.05, fog: '#d4a090' },
  { elev: 6, sun: '#ffb070', sunI: 2.6, skyTop: '#5080c0', skyHorizon: '#ffc898', hemiSky: '#a8a8dc', hemiGround: '#6c5660', hemiI: 1.0, fog: '#e0c0a0' },
  { elev: 14, sun: '#ffe8c8', sunI: 3.1, skyTop: '#4f86d0', skyHorizon: '#e8d8c0', hemiSky: '#b0c4e4', hemiGround: '#7a6e44', hemiI: 0.95, fog: '#d0dce8' },
  { elev: 26, sun: '#fff4e6', sunI: 3.35, skyTop: '#4a88d4', skyHorizon: '#c8dcf0', hemiSky: '#a9c6ec', hemiGround: '#5b7456', hemiI: 0.92, fog: '#c0d4e8' },
  { elev: 64, sun: '#fffaf4', sunI: 3.45, skyTop: '#3c7ed6', skyHorizon: '#b8d4ec', hemiSky: '#a6c4ec', hemiGround: '#577052', hemiI: 0.86, fog: '#b4cce4' },
]
