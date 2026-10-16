import type { WorldPalette } from '../../../world/geometry'
import type { LightKey } from '../../../world/palette'

export const paletteC: WorldPalette = {
  grassA: '#94d6a4', grassB: '#bfe6a8', grassDry: '#f5e6b4', grassFar: '#bfe3d2',
  dirt: '#e9b896', rock: '#f2c3a2', rockDark: '#b49ed8',
  road: '#a3a6c6', roadLine: '#ffffff', curb: '#fff0dc',
  trunk: '#c8957a', leaf: ['#73c894', '#a3d97f', '#62b9ad'], conifer: '#4fae95',
  wall: ['#fff8ee', '#ffe6df', '#e6f2ff'], roof: ['#ff8c78', '#78acff', '#ffc46a'],
  cityA: '#fff3e8', cityB: '#dce4ff', cityTop: '#ffffff',
  mountain: '#b6c2ef', mountainSnow: '#ffffff', water: '#9fe0f5',
  fields: ['#f4e6b0', '#b9e4a4', '#a4d9a8', '#d2ecb4', '#f1ead0', '#9fd3a4'],
  cityTints: ['#f4f1ec', '#dbe6f6', '#fbe9dc', '#e6eef8', '#ffffff', '#f0e6f4', '#e4f1ec'],
}

export const lightKeysC: LightKey[] = [
  { elev: -14, sun: '#b7c2ff', sunI: 0.80, skyTop: '#2b3270', skyHorizon: '#5a5fa6', hemiSky: '#6b70c0', hemiGround: '#35365a', hemiI: 0.75, fog: '#4a4f92' },
  { elev: -4, sun: '#ff9f8f', sunI: 0.00, skyTop: '#5e63b4', skyHorizon: '#ffb0a8', hemiSky: '#a197d8', hemiGround: '#5a4a68', hemiI: 0.79, fog: '#c6a6c8' },
  { elev: 1, sun: '#ffab80', sunI: 1.95, skyTop: '#7c8ee0', skyHorizon: '#ffc4a4', hemiSky: '#c0b4ec', hemiGround: '#8a6a6a', hemiI: 0.86, fog: '#ffd0bc' },
  { elev: 7, sun: '#ffd6a6', sunI: 2.76, skyTop: '#78b6ff', skyHorizon: '#fde9d8', hemiSky: '#cad8fa', hemiGround: '#a69a7a', hemiI: 0.94, fog: '#ffe6d6' },
  { elev: 26, sun: '#ffecd0', sunI: 2.99, skyTop: '#72b8ff', skyHorizon: '#e6f5ff', hemiSky: '#d6e8ff', hemiGround: '#a8b08a', hemiI: 0.98, fog: '#e6f3fb' },
  { elev: 64, sun: '#fff8ee', sunI: 3.22, skyTop: '#7fbcff', skyHorizon: '#dcf0ff', hemiSky: '#dcecff', hemiGround: '#aab48c', hemiI: 1.01, fog: '#e0f0fa' },
]
