import { createEnv } from './env'
import { useWorld } from '../../state/worldStore'

/** The single live environment (mutated by SunRig each frame; read by the HUD for smooth readouts). */
export const sharedEnv = createEnv(useWorld.getState().time)
