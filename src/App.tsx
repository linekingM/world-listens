import { WorldCanvas } from './scene/WorldCanvas'
import { TopBar } from './ui/TopBar'
import { TimeDial } from './ui/TimeDial'
import { useWorld } from './state/worldStore'

export default function App() {
  const style = useWorld((s) => s.style)
  return (
    <div className="app" data-style={style}>
      <div className="stage"><WorldCanvas /></div>
      <div className="ui-layer">
        <TopBar />
        <TimeDial />
      </div>
    </div>
  )
}
