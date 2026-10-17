import { WorldCanvas } from './scene/WorldCanvas'
import { SunDial } from './ui/SunDial'
import { Rail } from './ui/Rail'
import { TopActions } from './ui/TopActions'
import { Hint, StatusChips, Title, Toasts, useAppEffects } from './ui/Feedback'
import { useWorld } from './state/worldStore'
import { overlayRef } from './ui/overlay'
import { SelectionBar } from './ui/SelectionActions'
import { RoamHud } from './ui/RoamHud'

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
        <SelectionBar />
        <SunDial />
        <Hint />
        <RoamHud />
      </div>
    </div>
  )
}
