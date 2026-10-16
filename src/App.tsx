import { WorldCanvas } from './scene/WorldCanvas'
import { SunDial } from './ui/SunDial'
import { Rail } from './ui/Rail'
import { TopActions } from './ui/TopActions'
import { Hint, StatusChips, Title, Toasts, useAppEffects } from './ui/Feedback'
import { useWorld } from './state/worldStore'
import { overlayRef } from './ui/overlay'

export default function App() {
  const style = useWorld((s) => s.style)
  const dragging = useWorld((s) => s.dragging)
  useAppEffects()
  return (
    <div className={`app${dragging ? ' is-dragging' : ''}`} data-style={style}>
      <div className="stage"><WorldCanvas /></div>
      <div className="html-overlay" ref={(el) => { if (el) overlayRef.current = el }} />
      <div className="ui-layer">
        <Title />
        <TopActions />
        <StatusChips />
        <Toasts />
        <Rail />
        <SunDial />
        <Hint />
      </div>
    </div>
  )
}
