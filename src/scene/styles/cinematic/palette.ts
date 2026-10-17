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

export const lightKeysA: LightKey[] = [
  // clearer physical day: deeper zenith blues, cooler less-white fog; low sun stays orange-amber (not cream)
  { elev: -14, sun: '#b8cdf4', sunI: 0.9, skyTop: '#0a1638', skyHorizon: '#223a6c', hemiSky: '#5a7fc4', hemiGround: '#1a1f3e', hemiI: 1.0, fog: '#1d3158' },
  { elev: -4, sun: '#ff5520', sunI: 0.0, skyTop: '#26386b', skyHorizon: '#e07a62', hemiSky: '#6a62a6', hemiGround: '#33283f', hemiI: 0.6, fog: '#6f6886' },
  { elev: 1, sun: '#ff4a12', sunI: 1.85, skyTop: '#3a5f98', skyHorizon: '#ff8a4a', hemiSky: '#8e88c8', hemiGround: '#5c4658', hemiI: 1.0, fog: '#c88868' },
  { elev: 7, sun: '#ff6a1c', sunI: 2.55, skyTop: '#4a78bc', skyHorizon: '#ff9e5c', hemiSky: '#9aa0d4', hemiGround: '#6c5660', hemiI: 0.98, fog: '#d4a078' },
  { elev: 14, sun: '#ff8a28', sunI: 2.9, skyTop: '#3f7acc', skyHorizon: '#e8b888', hemiSky: '#9cb4dc', hemiGround: '#6e6a48', hemiI: 0.9, fog: '#c8a888' },
  { elev: 26, sun: '#ffe0a8', sunI: 3.15, skyTop: '#2f6ec8', skyHorizon: '#62a0dc', hemiSky: '#8eb8e4', hemiGround: '#5b7456', hemiI: 0.88, fog: '#6a9ccc' },
  { elev: 64, sun: '#fff2dc', sunI: 3.25, skyTop: '#2464c4', skyHorizon: '#4e94d6', hemiSky: '#88b4e8', hemiGround: '#577052', hemiI: 0.8, fog: '#5e90c4' },
]
