import { useWorld, type StyleId } from '../state/worldStore'
import { STYLES } from '../scene/styles'

export function TopBar() {
  const style = useWorld((s) => s.style)
  const setStyle = useWorld((s) => s.setStyle)
  return (
    <header className="topbar">
      <div className="brand">
        <h1>如果世界听你的</h1>
        <p>Your Imagination, Our World</p>
      </div>
      <nav className="glass style-switch" aria-label="风格方向">
        {(['a', 'b', 'c'] as StyleId[]).map((id) => (
          <button key={id} className={id === style ? 'active' : ''} onClick={() => setStyle(id)}>
            <b>{id.toUpperCase()}</b>
            <span>{STYLES[id].name}</span>
          </button>
        ))}
      </nav>
    </header>
  )
}
