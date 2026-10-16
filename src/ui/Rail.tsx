import { useWorld } from '../state/worldStore'
import type { ObjType, WeatherId } from '../state/types'
import { ADDABLE, OBJECT_KINDS } from '../world/objects'
import { Icon, type IconName } from './icons'

const WEATHERS: { id: WeatherId; label: string; icon: IconName; note: string }[] = [
  { id: 'clear', label: '晴朗', icon: 'sun', note: '金色阳光' },
  { id: 'cloudy', label: '多云', icon: 'cloudy', note: '云层聚拢' },
  { id: 'mist', label: '薄雾', icon: 'mist', note: '远景朦胧' },
  { id: 'sunset', label: '日落', icon: 'sunset', note: '跳到黄昏' },
  { id: 'starry', label: '星空', icon: 'moon', note: '入夜繁星' },
]
const OBJ_ICON: Record<ObjType, IconName> = { tree: 'tree', pine: 'pine', rock: 'rock', house: 'house', tower: 'tower', bench: 'bench', lamp: 'lamp', island: 'island' }
const GRAVITY_PRESETS: { g: number; label: string }[] = [
  { g: 1, label: '正常' }, { g: 0.45, label: '月球' }, { g: 0, label: '失重' }, { g: -0.6, label: '反转' },
]

function RailBtn({ icon, label, panel, onClick, active }: { icon: IconName; label: string; panel?: 'weather' | 'add' | 'gravity'; onClick?: () => void; active?: boolean }) {
  const open = useWorld((s) => panel && s.panel === panel)
  const togglePanel = useWorld((s) => s.togglePanel)
  return (
    <button className={`rail-btn${open || active ? ' on' : ''}`} onClick={onClick ?? (() => panel && togglePanel(panel))} aria-label={label} aria-expanded={panel ? !!open : undefined} data-testid={`rail-${panel ?? 'view'}`}>
      <Icon name={icon} size={20} />
      <span className="rail-label">{label}</span>
    </button>
  )
}

function WeatherPanel() {
  const weather = useWorld((s) => s.weather)
  const setWeather = useWorld((s) => s.setWeather)
  return (
    <div className="panel glass" data-testid="panel-weather">
      <div className="panel-title">天气</div>
      <div className="chip-grid five">
        {WEATHERS.map((w) => (
          <button key={w.id} className={`chip${weather === w.id ? ' on' : ''}`} onClick={() => setWeather(w.id)} data-weather={w.id} aria-pressed={weather === w.id}>
            <Icon name={w.icon} size={22} />
            <span>{w.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-note">{WEATHERS.find((w) => w.id === weather)?.note} · 拖动天上的云朵可以移动它</div>
    </div>
  )
}

function AddPanel() {
  const placing = useWorld((s) => s.placing)
  const setPlacing = useWorld((s) => s.setPlacing)
  const setPanel = useWorld((s) => s.setPanel)
  return (
    <div className="panel glass" data-testid="panel-add">
      <div className="panel-title">添加物体</div>
      <div className="chip-grid four">
        {ADDABLE.map((t) => (
          <button key={t} className={`chip${placing === t ? ' on' : ''}`} data-add={t} onClick={() => { setPlacing(t); setPanel(null) }}>
            <Icon name={OBJ_ICON[t]} size={22} />
            <span>{OBJECT_KINDS[t].label}</span>
          </button>
        ))}
      </div>
      <div className="panel-note">选一个，然后点击场景放置。点选已有物体可移动、旋转或删除。</div>
    </div>
  )
}

function GravityPanel() {
  const gravity = useWorld((s) => s.gravity)
  const orbit = useWorld((s) => s.orbit)
  const setGravity = useWorld((s) => s.setGravity)
  const setOrbit = useWorld((s) => s.setOrbit)
  const restore = useWorld((s) => s.restoreRules)
  const pct = Math.round(gravity * 100)
  return (
    <div className="panel glass" data-testid="panel-gravity">
      <div className="panel-title">世界规则 <span className="panel-value">重力 {pct}%</span></div>
      <input
        onPointerDown={(e) => e.currentTarget.closest('.panel')?.classList.add('peek')}
        onPointerUp={(e) => e.currentTarget.closest('.panel')?.classList.remove('peek')}
        onPointerCancel={(e) => e.currentTarget.closest('.panel')?.classList.remove('peek')}
        className="slider"
        type="range" min={-1} max={1} step={0.05} value={gravity}
        onChange={(e) => setGravity(Number(e.target.value))}
        aria-label="重力强度"
        data-testid="gravity-slider"
      />
      <div className="slider-scale"><span>反转</span><span>失重</span><span>正常</span></div>
      <div className="chip-row">
        {GRAVITY_PRESETS.map((p) => (
          <button key={p.label} className={`pill${Math.abs(gravity - p.g) < 0.01 ? ' on' : ''}`} onClick={() => setGravity(p.g)} data-gravity={p.g}>{p.label}</button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={orbit} onChange={(e) => setOrbit(e.target.checked)} data-testid="orbit-toggle" />
        <span className="toggle-ui" />
        <span>万物环绕 · 物体绕世界中心缓缓公转</span>
      </label>
      <button className="pill wide" onClick={restore} data-testid="restore-rules"><Icon name="restore" size={16} /> 恢复正常</button>
    </div>
  )
}

/** Collapsible tool rail (bottom-left) and its panels. */
export function Rail() {
  const panel = useWorld((s) => s.panel)
  const railOpen = useWorld((s) => s.railOpen)
  const setRailOpen = useWorld((s) => s.setRailOpen)
  const resetCam = useWorld((s) => s.requestCameraReset)
  const toast = useWorld((s) => s.toast)
  const altered = useWorld((s) => s.gravity !== 1 || s.orbit)
  return (
    <div className={`rail-wrap${railOpen ? '' : ' closed'}`}>
      {railOpen && panel && panel !== 'save' && panel !== 'share' && (
        <div className="panel-slot">
          {panel === 'weather' && <WeatherPanel />}
          {panel === 'add' && <AddPanel />}
          {panel === 'gravity' && <GravityPanel />}
        </div>
      )}
      <nav className="rail glass" aria-label="工具">
        {railOpen && (
          <>
            <RailBtn icon="weather" label="天气" panel="weather" />
            <RailBtn icon="plus" label="添加" panel="add" />
            <RailBtn icon="feather" label="重力" panel="gravity" active={altered} />
            <RailBtn icon="camera" label="视角" onClick={() => { resetCam(); toast('视角已复位') }} />
            <span className="rail-sep" />
          </>
        )}
        <button className="rail-btn collapse" onClick={() => setRailOpen(!railOpen)} aria-label={railOpen ? '收起工具' : '展开工具'} data-testid="rail-toggle">
          <Icon name={railOpen ? 'close' : 'menu'} size={18} />
        </button>
      </nav>
    </div>
  )
}
