import { QUALITIES, QUALITY_LABEL } from '../state/quality'
import { useIsCompact } from './SelectionActions'
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

function RailBtn({ icon, label, panel, onClick, active, testId }: { icon: IconName; label: string; panel?: 'weather' | 'add' | 'gravity' | 'camera'; onClick?: () => void; active?: boolean; testId?: string }) {
  const open = useWorld((s) => panel && s.panel === panel)
  const togglePanel = useWorld((s) => s.togglePanel)
  return (
    <button className={`rail-btn${open || active ? ' on' : ''}`} onClick={onClick ?? (() => panel && togglePanel(panel))} aria-label={label} aria-expanded={panel ? !!open : undefined} data-testid={testId ?? `rail-${panel ?? 'view'}`}>
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

function QualityRow() {
  const quality = useWorld((s) => s.quality)
  const auto = useWorld((s) => s.qualityAuto)
  const setQuality = useWorld((s) => s.setQuality)
  return (
    <div className="quality-row" role="radiogroup" aria-label="画质">
      <span className="quality-label">画质</span>
      <button className={`pill sm${auto ? ' on' : ''}`} role="radio" aria-checked={auto} onClick={() => setQuality(null)} data-testid="q-auto">自动{auto ? `·${QUALITY_LABEL[quality]}` : ''}</button>
      {QUALITIES.map((q) => (
        <button key={q} className={`pill sm${!auto && quality === q ? ' on' : ''}`} role="radio" aria-checked={!auto && quality === q} onClick={() => setQuality(q)} data-testid={`q-${q}`}>{QUALITY_LABEL[q]}</button>
      ))}
    </div>
  )
}

function CameraPanel() {
  const camMode = useWorld((s) => s.camMode)
  const setCamMode = useWorld((s) => s.setCamMode)
  const resetCam = useWorld((s) => s.requestCameraReset)
  const toast = useWorld((s) => s.toast)
  const compact = useIsCompact()
  return (
    <div className="panel glass" data-testid="panel-camera">
      <div className="panel-title">视角</div>
      <div className="chip-row">
        <button className="pill" onClick={() => { resetCam(); toast('视角已复位') }} data-testid="cam-reset"><Icon name="restore" size={16} /> 复位视角</button>
        <button className={`pill${camMode === 'roam' ? ' on' : ''}`} aria-pressed={camMode === 'roam'} onClick={() => setCamMode(camMode === 'roam' ? 'orbit' : 'roam')} data-testid="cam-roam">
          <Icon name="camera" size={16} /> 自由漫游
        </button>
      </div>
      <QualityRow />
      <div className="panel-note">
        {compact
          ? '漫游：左下摇杆行走，拖动屏幕环顾，右下按钮升降，飞上浮岛或走向城门。'
          : '漫游：WASD / 方向键行走 · 拖动环顾 · 空格/E 上升 · Q 下降 · Shift 加速 · Esc 返回。平时可拖动旋转、滚轮缩放、右键平移。'}
      </div>
    </div>
  )
}

/** Collapsible tool rail (bottom-left) and its panels. */
export function Rail() {
  const compact = useIsCompact()
  const hasSel = useWorld((s) => s.selectedId !== null)
  const panel = useWorld((s) => s.panel)
  const railOpen = useWorld((s) => s.railOpen)
  const setRailOpen = useWorld((s) => s.setRailOpen)
  const roaming = useWorld((s) => s.camMode === 'roam')
  const altered = useWorld((s) => s.gravity !== 1 || s.orbit)
  // phones: one bottom bar — while something is selected its actions take the rail's place
  if (compact && (hasSel || roaming)) return null
  return (
    <div className={`rail-wrap${railOpen ? '' : ' closed'}`}>
      {railOpen && panel && panel !== 'save' && panel !== 'share' && (
        <div className="panel-slot">
          {panel === 'weather' && <WeatherPanel />}
          {panel === 'add' && <AddPanel />}
          {panel === 'gravity' && <GravityPanel />}
          {panel === 'camera' && <CameraPanel />}
        </div>
      )}
      <nav className="rail glass" aria-label="工具">
        {railOpen && (
          <>
            <RailBtn icon="weather" label="天气" panel="weather" />
            <RailBtn icon="plus" label="添加" panel="add" />
            <RailBtn icon="feather" label="重力" panel="gravity" active={altered} />
            <RailBtn icon="camera" label="视角" panel="camera" active={roaming} testId="rail-view" />
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
