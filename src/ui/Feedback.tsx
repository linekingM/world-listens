import { useEffect } from 'react'
import { useWorld } from '../state/worldStore'
import { decodeShare } from '../state/serialize'
import { OBJECT_KINDS } from '../world/objects'
import { sims } from '../scene/systems/simulation'
import { Icon } from './icons'

export function Title() {
  const name = useWorld((s) => s.name)
  return (
    <header className="title-block">
      <h1>如果世界听你的</h1>
      <p className="subtitle">Your Imagination, Our World</p>
      {name && name !== '我的世界' && <p className="world-name" data-testid="title-world-name">「{name}」</p>}
    </header>
  )
}

export function Toasts() {
  const toasts = useWorld((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast glass ${t.kind}`}>{t.kind === 'ok' && <Icon name="check" size={15} />}{t.text}</div>)}
    </div>
  )
}

export function StatusChips() {
  const gravity = useWorld((s) => s.gravity)
  const orbit = useWorld((s) => s.orbit)
  const placing = useWorld((s) => s.placing)
  const setPlacing = useWorld((s) => s.setPlacing)
  const restore = useWorld((s) => s.restoreRules)
  if (placing) {
    return (
      <div className="status-chip glass" data-testid="placing-chip">
        <span>点击地面放置「{OBJECT_KINDS[placing].label}」</span>
        <button className="chip-x" onClick={() => setPlacing(null)} aria-label="取消放置"><Icon name="close" size={14} /></button>
      </div>
    )
  }
  if (gravity === 1 && !orbit) return null
  const label = gravity < -0.05 ? '重力反转' : gravity < 0.1 ? '失重' : gravity < 0.95 ? `低重力 ${Math.round(gravity * 100)}%` : '正常重力'
  return (
    <div className="status-chip glass rules" data-testid="gravity-chip">
      <Icon name="feather" size={15} />
      <span>{label}{orbit ? ' · 万物环绕' : ''}</span>
      <button className="chip-restore" onClick={restore}>恢复</button>
    </div>
  )
}

export function Hint() {
  const seen = useWorld((s) => s.hintSeen)
  const setSeen = useWorld((s) => s.setHintSeen)
  if (seen) return null
  return (
    <div className="hint glass" data-testid="hint">
      <p><b>这个世界听你的。</b>拖动底部的太阳改变时间，或直接拖动天空中的太阳和云朵；点选物体移动、旋转或删除；左下角可以改天气、添加物体、改变重力。</p>
      <button className="pill primary" onClick={setSeen} data-testid="hint-ok">开始创造</button>
    </div>
  )
}

/** Keyboard shortcuts + open a shared world from the URL hash. */
export function useAppEffects() {
  useEffect(() => {
    const m = location.hash.match(/[#&]w=([^&]+)/)
    if (m) {
      decodeShare(m[1]).then((doc) => {
        useWorld.getState().loadDoc(doc)
        useWorld.getState().toast(`已打开分享的世界「${doc.name}」`, 'ok')
        useWorld.getState().setHintSeen()
      }).catch(() => useWorld.getState().toast('分享链接无法解析，已打开默认世界', 'error'))
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const st = useWorld.getState()
      if (e.key === 'Escape') {
        if (st.placing) st.setPlacing(null)
        else if (st.panel) st.setPanel(null)
        else st.select(null)
        return
      }
      const obj = st.objects.find((o) => o.id === st.selectedId)
      if (!obj) return
      if (e.key === 'Delete' || e.key === 'Backspace') { st.removeObject(obj.id); sims.delete(obj.id); e.preventDefault() }
      else if (e.key === 'r' || e.key === 'R') st.updateObject(obj.id, { rotY: obj.rotY + (e.shiftKey ? 1 : -1) * Math.PI / 12 })
      else if (e.key === 'f' || e.key === 'F') { if (obj.type !== 'island') st.toggleFloat(obj.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
