import { useCallback, useRef } from 'react'
import { useWorld } from '../state/worldStore'
import { SUNRISE, SUNSET, phaseName, timeLabel } from '../world/sun'

const H0 = 3.5, H1 = 21.5 // arc spans 03:30 → 21:30, symmetric around solar noon (12:30)
const W = 260, HGT = 118, CX = W / 2, CY = 108, R = 96

const angleOf = (h: number) => Math.PI * (1 - (h - H0) / (H1 - H0)) // π (left) → 0 (right)
const pt = (h: number, r = R) => {
  const a = angleOf(h)
  return [CX + Math.cos(a) * r, CY - Math.sin(a) * r] as const
}
const arcPath = (h0: number, h1: number, r = R) => {
  const [x0, y0] = pt(h0, r), [x1, y1] = pt(h1, r)
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
}

/** Drag the sun along its path to set the time of day. */
export function TimeDial() {
  const time = useWorld((s) => s.time)
  const setTime = useWorld((s) => s.setTime)
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W - CX
    const y = CY - ((e.clientY - r.top) / r.height) * HGT
    let a = Math.atan2(Math.max(y, -20), x)
    if (a < 0) a = x < 0 ? Math.PI : 0
    const h = H0 + (1 - a / Math.PI) * (H1 - H0)
    setTime(Math.min(H1, Math.max(H0, h)))
  }, [setTime])

  const clamped = Math.min(H1, Math.max(H0, time))
  const [sx, sy] = pt(clamped)
  const isNight = time < SUNRISE - 0.4 || time > SUNSET + 0.6
  const [rx0, ry0] = pt(SUNRISE, R + 10), [rx1, ry1] = pt(SUNSET, R + 10)

  return (
    <div className="glass time-dial">
      <div className="time-readout">
        <span className="time-big">{timeLabel(time)}</span>
        <span className="time-phase">{phaseName(time)}</span>
        <span className="time-hint">拖动太阳，改变一天</span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${HGT}`}
        className="dial-svg"
        onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); fromEvent(e) }}
        onPointerMove={(e) => dragging.current && fromEvent(e)}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        role="slider"
        aria-label="一天中的时间"
        aria-valuemin={H0}
        aria-valuemax={H1}
        aria-valuenow={Number(time.toFixed(2))}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setTime(Math.max(H0, time - 0.25))
          if (e.key === 'ArrowRight') setTime(Math.min(H1, time + 0.25))
        }}
      >
        <defs>
          <linearGradient id="dayArc" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb98a" />
            <stop offset="0.5" stopColor="#fff3c9" />
            <stop offset="1" stopColor="#ff9f7a" />
          </linearGradient>
          <radialGradient id="sunGlow">
            <stop offset="0" stopColor="#fff6dc" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffd38a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={arcPath(H0, H1)} className="arc-track" />
        <path d={arcPath(SUNRISE, SUNSET)} stroke="url(#dayArc)" className="arc-day" />
        <path d={arcPath(H0, clamped)} className="arc-progress" />
        <line x1={rx0} y1={ry0} x2={rx1} y2={ry1} className="horizon" />
        {[6, 12, 18].map((h) => {
          const [x, y] = pt(h, R - 14)
          return <text key={h} x={x} y={y + 3} className="tick">{String(h).padStart(2, '0')}</text>
        })}
        <circle cx={sx} cy={sy} r={22} fill="url(#sunGlow)" opacity={isNight ? 0.25 : 1} />
        {isNight ? (
          <path d={`M ${sx + 3} ${sy - 8} a 8 8 0 1 0 6 12 a 6.5 6.5 0 1 1 -6 -12 z`} className="moon" />
        ) : (
          <circle cx={sx} cy={sy} r={8} className="sun-knob" />
        )}
      </svg>
    </div>
  )
}
