import type { WorldPalette } from '../../../world/geometry'
import type { LightKey } from '../../../world/palette'

export const paletteA: WorldPalette = {
  grassA: '#4a8a30', grassB: '#7aa83c', grassDry: '#a9a552', grassFar: '#86a77a',
  dirt: '#7a6248', rock: '#8d7c6c', rockDark: '#4c4450',
  road: '#5d6169', roadLine: '#e8e4d8', curb: '#b9b3a7',
  trunk: '#5a4332', leaf: ['#4c7a2c', '#6a8e34', '#3d6a33'], conifer: '#2e5938',
  wall: ['#f1e9dc', '#ecdcc6', '#f6f1e8'], roof: ['#b5553e', '#5b788b', '#a5653f'],
  cityA: '#d2d7dd', cityB: '#9faab8', cityTop: '#eef0f2',
  mountain: '#8a98aa', mountainSnow: '#f6f8fb', water: '#9cc8e6',
}

export const lightKeysA: LightKey[] = [
  { elev: -14, sun: '#7d93c9', sunI: 0.45, skyTop: '#081130', skyHorizon: '#1c2a52', hemiSky: '#3a4c80', hemiGround: '#161b28', hemiI: 0.55, fog: '#1b2746' },
  { elev: -4, sun: '#ff8a5a', sunI: 0.0, skyTop: '#26386b', skyHorizon: '#d88468', hemiSky: '#5f6a9a', hemiGround: '#2e2a33', hemiI: 0.6, fog: '#6f6886' },
  { elev: 1, sun: '#ff9248', sunI: 1.7, skyTop: '#4d77b3', skyHorizon: '#ffb07a', hemiSky: '#9fb3df', hemiGround: '#6b5a48', hemiI: 1.1, fog: '#e2ac88' },
  { elev: 7, sun: '#ffbe72', sunI: 2.9, skyTop: '#5b8fd0', skyHorizon: '#ffd3a2', hemiSky: '#a8c4ec', hemiGround: '#76684a', hemiI: 1.15, fog: '#eccdb0' },
  { elev: 26, sun: '#ffdcaa', sunI: 3.4, skyTop: '#4f8ad8', skyHorizon: '#d6e4f0', hemiSky: '#b2cdee', hemiGround: '#6b6a48', hemiI: 1.0, fog: '#d8e2ea' },
  { elev: 64, sun: '#fff5e6', sunI: 3.8, skyTop: '#3c7ed6', skyHorizon: '#c5dcf0', hemiSky: '#b9d4f4', hemiGround: '#6f6f4c', hemiI: 1.05, fog: '#c9dcee' },
]
