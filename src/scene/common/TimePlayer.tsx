import { useFrame } from '@react-three/fiber'
import { useWorld } from '../../state/worldStore'
import { interaction } from '../systems/interaction'

/**
 * Auto time-of-day: while playing, time advances by `playRate` game minutes per real second (30 = a day in ~48 s).
 * Dragging the dial or the sun holds it; it resumes on release. Lighting, sky, lanterns and fireflies follow time.
 */
export function TimePlayer() {
  useFrame((_, rawDt) => {
    const st = useWorld.getState()
    if (!st.playing || st.timeHeld || interaction.drag?.kind === 'sun' || document.hidden) return
    const dt = Math.min(rawDt, 0.25)
    st.setTime(st.time + (st.playRate / 60) * dt, 'play')
  })
  return null
}
