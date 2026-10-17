import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorld } from '../state/worldStore'
import { sunAt, phaseName, timeLabel } from '../world/sun'
import { sharedEnv } from '../scene/common/sharedEnv'
import { Icon } from './icons'
import { PLAY_RATES } from '../state/serialize'

const rateLabel = (m: number) => (m >= 60 ? `${m / 60}小时/秒` : `${m}分/秒`)

/** Play / pause the day, plus a compact rate pill that cycles the presets. */
function PlayControls() {
  const playing = useWorld((s) => s.playing)
  const rate = useWorld((s) => s.playRate)
  const setPlaying = useWorld((s) => s.setPlaying)
  const setRate = useWorld((s) => s.setPlayRate)
  const next = () => setRate(PLAY_RATES[(PLAY_RATES.indexOf(rate) + 1) % PLAY_RATES.length])
  return (
    <div className="dial-play">
      <button className={`play-btn${playing ? ' on' : ''}`} onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停时间' : '播放时间'} aria-pressed={playing} data-testid="time-play">
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <button className="rate-pill" onClick={next} aria-label={`播放速度 ${rateLabel(rate)}，点按切换`} data-testid="time-rate">{rateLabel(rate)}</button>
    </div>
  )
}

const W = 400, H = 64, BASE = 46, AMP = 34
const MAX_E = 64
const xOf = (h: number) => (h / 24) * W
const yOf = (h: number) => {
  const e = sunAt(h).elevation
  return BASE - (e >= 0 ? (e / MAX_E) * AMP : (e / 30) * 10)
}
const curve = (() => {
  let d = ''
  for (let h = 0; h <= 24.001; h += 0.25) d += `${d ? 'L' : 'M'}${xOf(h).toFixed(1)} ${yOf(h).toFixed(1)}`
  return d
})()
const dayCurve = (() => {
  let d = ''
  for (let h = 5.6; h <= 19.8; h += 0.2) if (sunAt(h).elevation > -0.5) d += `${d ? 'L' : 'M'}${xOf(h).toFixed(1)} ${yOf(h).toFixed(1)}`
  return d
})()

/** Full-24h sun-path dial: drag along the curve (or use arrow keys) to change the time. */
export function SunDial() {
  const time = useWorld((s) => s.time)
  const setTime = useWorld((s) => s.setTime)
  const setHeld = useWorld((s) => s.setTimeHeld)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef(false)
  const [shown, setShown] = useState(time)

  // follow the *rendered* time so the bead glides with cinematic transitions
  useEffect(() => {
    let raf = 0
    const tick = () => { setShown((p) => (Math.abs(p - sharedEnv.time) > 0.005 ? sharedEnv.time : p)); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const h = Math.min(23.99, Math.max(0, ((e.clientX - r.left) / r.width) * 24))
    setTime(Math.round(h * 12) / 12, 'drag')
  }, [setTime])

  const night = sunAt(shown).elevation < -2
  const label = phaseName(shown)
  return (
    <div className="sun-dial glass" data-testid="sun-dial">
      <PlayControls />
      <div className="dial-readout">
        <span className="dial-time" data-testid="dial-time">{timeLabel(time)}</span>
        <span className="dial-phase">{label}</span>
      </div>
      <svg
        ref={svg}
        className="dial-svg"
        viewBox={`-8 -4 ${W + 16} ${H + 8}`}
        role="slider"
        aria-label="一天中的时间（拖动太阳）"
        aria-valuemin={0}
        aria-valuemax={24}
        aria-valuenow={Math.round(time * 100) / 100}
        aria-valuetext={timeLabel(time)}
        tabIndex={0}
        onPointerDown={(e) => { drag.current = true; setHeld(true); svg.current?.setPointerCapture(e.pointerId); fromEvent(e) }}
        onPointerMove={(e) => drag.current && fromEvent(e)}
        onPointerUp={() => { drag.current = false; setHeld(false) }}
        onPointerCancel={() => { drag.current = false; setHeld(false) }}
        onLostPointerCapture={() => { drag.current = false; setHeld(false) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setTime(time - 0.25, 'drag'); e.preventDefault() }
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setTime(time + 0.25, 'drag'); e.preventDefault() }
        }}
      >
        <defs>
          <linearGradient id="dayg" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb37a" />
            <stop offset="0.5" stopColor="#fff3cf" />
            <stop offset="1" stopColor="#ff9a6a" />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={BASE} y2={BASE} className="horizon" />
        <path d={curve} className="arc-track" />
        <path d={dayCurve} className="arc-day" stroke="url(#dayg)" />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={xOf(h)} y={H + 2} className="tick">{String(h).padStart(2, '0')}</text>
        ))}
        <g transform={`translate(${xOf(shown)} ${yOf(shown)})`}>
          {night ? (
            <circle r={6} className="moon" />
          ) : (
            <>
              <circle r={13} className="sun-glow" />
              <circle r={7} className="sun-knob" />
            </>
          )}
        </g>
      </svg>
      <span className="dial-icon" aria-hidden><Icon name={night ? 'moon' : 'sun'} size={16} /></span>
    </div>
  )
}
