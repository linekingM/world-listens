import { createContext, useContext } from 'react'
import type { Env } from './env'
import type { StyleDef } from '../styles/types'

export const EnvContext = createContext<Env | null>(null)
export const StyleContext = createContext<StyleDef | null>(null)

export function useEnv() {
  const e = useContext(EnvContext)
  if (!e) throw new Error('useEnv outside <WorldCanvas>')
  return e
}
export function useStyleDef() {
  const s = useContext(StyleContext)
  if (!s) throw new Error('useStyleDef outside <WorldCanvas>')
  return s
}
