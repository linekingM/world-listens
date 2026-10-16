import type { StyleId } from '../../state/worldStore'
import type { StyleDef } from './types'
import { styleA } from './cinematic'
import { styleB } from './painterly'
import { styleC } from './diorama'

export const STYLES: Record<StyleId, StyleDef> = { a: styleA, b: styleB, c: styleC }
