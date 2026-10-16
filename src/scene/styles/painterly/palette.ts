import type { WorldPalette } from '../../../world/geometry'
import type { LightKey } from '../../../world/palette'

export const paletteB: WorldPalette = {
  grassA: '#52a44e', grassB: '#8fc25e', grassDry: '#cfc878', grassFar: '#9fd0a0',
  dirt: '#b98a5c', rock: '#c99c74', rockDark: '#7c6a94',
  road: '#7e8496', roadLine: '#fff4dc', curb: '#f1e4c8',
  trunk: '#7d5439', leaf: ['#4e9a46', '#7bbb4a', '#3c8b5a'], conifer: '#2f7d5d',
  wall: ['#fff3e0', '#ffe6cc', '#f4efff'], roof: ['#e2634a', '#4c88bd', '#e89a3c'],
  cityA: '#f6efe6', cityB: '#cfdaee', cityTop: '#ffffff',
  mountain: '#93a9da', mountainSnow: '#ffffff', water: '#8fd3f0',
}

export const lightKeysB: LightKey[] = [
  { elev: -14, sun: '#a9b8ff', sunI: 0.55, skyTop: '#0e1a4a', skyHorizon: '#2f3f7a', hemiSky: '#4a5aa0', hemiGround: '#24263e', hemiI: 0.75, fog: '#2a3870' },
  { elev: -4, sun: '#ff8f7a', sunI: 0.0, skyTop: '#33428a', skyHorizon: '#f39a8c', hemiSky: '#7b77b8', hemiGround: '#3a2f48', hemiI: 0.8, fog: '#9a86b0' },
  { elev: 1, sun: '#ffa060', sunI: 1.6, skyTop: '#4a6fc0', skyHorizon: '#ffb486', hemiSky: '#a39ad6', hemiGround: '#6a4c4a', hemiI: 0.95, fog: '#f2b598' },
  { elev: 7, sun: '#ffc27c', sunI: 2.5, skyTop: '#3a8ee8', skyHorizon: '#ffe2bc', hemiSky: '#a9c2f0', hemiGround: '#7a6a4a', hemiI: 1.05, fog: '#f6d8bc' },
  { elev: 26, sun: '#ffe6bc', sunI: 2.9, skyTop: '#2f8ce6', skyHorizon: '#c8ecff', hemiSky: '#b6d6ff', hemiGround: '#7d8a5a', hemiI: 1.15, fog: '#cdeafa' },
  { elev: 64, sun: '#fff6e6', sunI: 3.1, skyTop: '#2a84e2', skyHorizon: '#bfe6ff', hemiSky: '#bcdcff', hemiGround: '#808c5c', hemiI: 1.2, fog: '#c6e6f8' },
]
