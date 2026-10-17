import { useEffect, useRef, useState } from 'react'
import { useWorld } from '../state/worldStore'
import { roam } from '../scene/common/FreeRoam'
import { useIsCompact } from './SelectionActions'
import { Icon } from './icons'

const JOY_R = 46

/** Virtual joystick: writes a -1..1 move vector into the free-roam input. */
function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const origin = useRef<{ x: number; y: number; id: number } | null>(null)
  const set = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy), k = d > JOY_R ? JOY_R / d : 1
    const x = dx * k, y = dy * k
    setKnob({ x, y })
    roam.input.joyX = x / JOY_R
    roam.input.joyY = -y / JOY_R
  }
  const end = () => { origin.current = null; set(0, 0) }
  return (
    <div
      className="joystick glass" data-testid="roam-joystick"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId }
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e.clientX - origin.current.x, e.clientY - origin.current.y)
        e.stopPropagation()
      }}
      onPointerMove={(e) => { const o = origin.current; if (o && e.pointerId === o.id) set(e.clientX - o.x, e.clientY - o.y) }}
      onPointerUp={end} onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function HoldBtn({ dir, label }: { dir: 1 | -1; label: string }) {
  const off = () => { roam.input.up = 0 }
  return (
    <button className="roam-btn glass" aria-label={label} data-testid={`roam-${dir > 0 ? 'up' : 'down'}`}
      onPointerDown={(e) => { roam.input.up = dir; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerUp={off} onPointerCancel={off} onPointerLeave={off}>
      <span style={{ display: 'inline-block', transform: dir > 0 ? 'rotate(180deg)' : 'none' }}>▾</span>
    </button>
  )
}

const moving = () =>
  roam.keys.size > 0
  || Math.hypot(roam.input.joyX, roam.input.joyY) > 0.08
  || roam.input.up !== 0
  || Math.abs(roam.gesture.fwd) > 0.02
  || Math.abs(roam.gesture.rise) > 0.02
  || !!roam.glide

/** Free-roam overlay: compact chip by default; tap to expand the gesture hint. Joystick + up/down on phones. */
export function RoamHud() {
  const roaming = useWorld((s) => s.camMode === 'roam')
  const setCamMode = useWorld((s) => s.setCamMode)
  const compact = useIsCompact()
  const [open, setOpen] = useState(false)

  // collapsed by default whenever roam starts
  useEffect(() => { if (roaming) setOpen(false) }, [roaming])

  // auto-collapse a few seconds after expand, or as soon as the player moves
  useEffect(() => {
    if (!roaming || !open) return
    const t = window.setTimeout(() => setOpen(false), 4500)
    const id = window.setInterval(() => { if (moving()) setOpen(false) }, 180)
    return () => { clearTimeout(t); clearInterval(id) }
  }, [roaming, open])

  if (!roaming) return null
  const lock = () => (document.querySelector('.stage canvas') as HTMLCanvasElement | null)?.requestPointerLock?.()
  return (
    <>
      <div className={`roam-hint glass${open ? ' is-open' : ' is-collapsed'}`} data-testid="roam-hud">
        <button
          type="button"
          className="roam-title"
          aria-expanded={open}
          aria-label={open ? '收起操作提示' : '展开操作提示'}
          data-testid="roam-hint-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          自由漫游{!open && <span className="roam-more" aria-hidden> · ?</span>}
        </button>
        {open && (
          <span className="roam-keys" data-testid="roam-keys">
            {compact
              ? '摇杆行走 · 单指环顾 · 双指捏合进退 · 双指上下推升降 · 双击飞往'
              : <><kbd>WASD</kbd> 行走 · 拖动环顾 · <kbd>空格</kbd>/<kbd>E</kbd> 上升 · <kbd>Q</kbd> 下降 · <kbd>Shift</kbd> 加速</>}
          </span>
        )}
        {!compact && open && <button className="pill small" onClick={lock} data-testid="roam-lock">锁定鼠标</button>}
        <button className="pill small" onClick={() => setCamMode('orbit')} data-testid="roam-exit"><Icon name="close" size={14} /> {compact ? '返回' : '返回 Esc'}</button>
      </div>
      {compact && (
        <>
          <Joystick />
          <div className="roam-updown"><HoldBtn dir={1} label="上升" /><HoldBtn dir={-1} label="下降" /></div>
        </>
      )}
    </>
  )
}
