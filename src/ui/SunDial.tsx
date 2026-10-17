import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorld } from '../state/worldStore'
import { sunAt, phaseName, timeLabel } from '../world/sun'
import { sharedEnv } from '../scene/common/sharedEnv'
import { Icon } from './icons'
import { PLAY_RATES } from '../state/serialize'
import { physicalSunWarmth, effectiveWarmth, warmthToRgb } from '../world/sunLook'

const rateLabel = (m: number) => (m >= 60 ? `${m / 60}小时/秒` : `${m}分/秒`)

function PlayControls({ showRate }: { showRate: boolean }) {
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
      {showRate && (
        <button className="rate-pill" onClick={next} aria-label={`播放速度 ${rateLabel(rate)}，点按切换`} data-testid="time-rate">{rateLabel(rate)}</button>
      )}
    </div>
  )
}

const PRESETS: { id: string; label: string; mode: 'auto' | 'manual'; warmth: number; hue: number }[] = [
  { id: 'auto', label: '自动', mode: 'auto', warmth: 0, hue: 0 },
  { id: 'white', label: '白日', mode: 'manual', warmth: 0, hue: 0 },
  { id: 'gold', label: '暖黄', mode: 'manual', warmth: 0.35, hue: 0 },
  { id: 'amber', label: '琥珀', mode: 'manual', warmth: 0.65, hue: -5 },
  { id: 'red', label: '橙红', mode: 'manual', warmth: 0.9, hue: -10 },
]

/** Manual / auto sun-disc colour. Numbers shown so the user can quote good values. */
function SunLookControls({ onTouch }: { onTouch: () => void }) {
  const look = useWorld((s) => s.sunLook)
  const setSunLook = useWorld((s) => s.setSunLook)
  const time = useWorld((s) => s.time)
  const elev = sunAt(time).elevation
  const phys = physicalSunWarmth(elev, time)
  const eff = effectiveWarmth(look, elev, time)
  const [r, g, b] = warmthToRgb(eff, look.hue)
  return (
    <div className="sun-look" data-testid="sun-look" onPointerDown={onTouch}>
      <div className="sun-look-row">
        <span className="sun-look-label">太阳色</span>
        <div className="sun-look-presets" role="group" aria-label="太阳色预设">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pill sm${look.mode === p.mode && (p.mode === 'auto' ? look.mode === 'auto' : Math.abs(look.warmth - p.warmth) < 0.05 && Math.abs(look.hue - p.hue) < 3) ? ' on' : ''}`}
              data-testid={`sun-preset-${p.id}`}
              onClick={() => { setSunLook({ mode: p.mode, warmth: p.warmth, hue: p.hue }); onTouch() }}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <div className="sun-look-row">
        <label className="sun-look-field">
          <span>暖度 {look.mode === 'auto' ? `(自动 ${phys.toFixed(2)})` : look.warmth.toFixed(2)}</span>
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round((look.mode === 'manual' ? look.warmth : phys) * 100)}
            data-testid="sun-warmth"
            aria-valuetext={look.mode === 'auto' ? `自动 ${phys.toFixed(2)}` : look.warmth.toFixed(2)}
            onChange={(e) => {
              const warmth = Number(e.target.value) / 100
              setSunLook({ mode: 'manual', warmth })
              onTouch()
            }}
          />
        </label>
        <label className="sun-look-field">
          <span>色相 {look.hue.toFixed(0)}°</span>
          <input
            type="range" min={-30} max={30} step={1}
            value={look.hue}
            data-testid="sun-hue"
            onChange={(e) => {
              setSunLook({ mode: look.mode === 'auto' ? 'manual' : look.mode, hue: Number(e.target.value), warmth: look.mode === 'auto' ? phys : look.warmth })
              onTouch()
            }}
          />
        </label>
      </div>
      <div className="sun-look-nums" data-testid="sun-look-nums">
        <span className="swatch" style={{ background: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})` }} aria-hidden />
        mode={look.mode} · warmth={eff.toFixed(2)} · hue={look.hue.toFixed(0)} · elev={elev.toFixed(1)}° · rgb={r.toFixed(2)},{g.toFixed(2)},{b.toFixed(2)}
      </div>
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

const IDLE_MS = 5500

export function SunDial() {
  const time = useWorld((s) => s.time)
  const setTime = useWorld((s) => s.setTime)
  const setHeld = useWorld((s) => s.setTimeHeld)
  const svg = useRef<SVGSVGElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const [shown, setShown] = useState(time)
  const [open, setOpen] = useState(false)
  const [idleGen, setIdleGen] = useState(0)

  useEffect(() => {
    let raf = 0
    const tick = () => { setShown((p) => (Math.abs(p - sharedEnv.time) > 0.005 ? sharedEnv.time : p)); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const touch = useCallback(() => { setIdleGen((n) => n + 1) }, [])

  useEffect(() => {
    if (!open) return
    let t = 0
    const arm = () => {
      t = window.setTimeout(() => {
        if (drag.current) { arm(); return }
        setOpen(false)
      }, IDLE_MS)
    }
    arm()
    return () => clearTimeout(t)
  }, [open, idleGen])

  useEffect(() => {
    if (!open) return
    const el = root.current
    if (!el) return
    const on = () => touch()
    el.addEventListener('pointerdown', on)
    el.addEventListener('pointermove', on)
    return () => { el.removeEventListener('pointerdown', on); el.removeEventListener('pointermove', on) }
  }, [open, touch])

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const h = Math.min(23.99, Math.max(0, ((e.clientX - r.left) / r.width) * 24))
    setTime(Math.round(h * 12) / 12, 'drag')
    touch()
  }, [setTime, touch])

  const night = sunAt(shown).elevation < -2
  const label = phaseName(shown)
  return (
    <div
      ref={root}
      className={`sun-dial glass${open ? ' is-open' : ' is-collapsed'}`}
      data-testid="sun-dial"
      data-open={open ? '1' : '0'}
    >
      <div className="dial-main">
        <PlayControls showRate={open} />
        <button
          type="button"
          className="dial-readout"
          aria-expanded={open}
          aria-label={open ? '收起时间盘' : '展开时间盘'}
          data-testid="dial-toggle"
          onClick={() => { setOpen((v) => !v); touch() }}
        >
          <span className="dial-time" data-testid="dial-time">{timeLabel(time)}</span>
          <span className="dial-phase">{label}{!open && <span className="dial-more" aria-hidden> · ▾</span>}</span>
        </button>
        {open && (
          <>
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
              data-testid="dial-svg"
              onPointerDown={(e) => { drag.current = true; setHeld(true); svg.current?.setPointerCapture(e.pointerId); fromEvent(e) }}
              onPointerMove={(e) => drag.current && fromEvent(e)}
              onPointerUp={() => { drag.current = false; setHeld(false); touch() }}
              onPointerCancel={() => { drag.current = false; setHeld(false); touch() }}
              onLostPointerCapture={() => { drag.current = false; setHeld(false); touch() }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setTime(time - 0.25, 'drag'); e.preventDefault(); touch() }
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setTime(time + 0.25, 'drag'); e.preventDefault(); touch() }
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
          </>
        )}
      </div>
      {open && <SunLookControls onTouch={touch} />}
    </div>
  )
}
