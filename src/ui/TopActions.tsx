import { useEffect, useRef, useState } from 'react'
import { useWorld } from '../state/worldStore'
import { encodeShare, listSaves, writeSaves, type SavedWorld } from '../state/serialize'
import { Icon } from './icons'
import { cameraApi } from '../scene/common/CameraRig'
import { timeLabel, phaseName } from '../world/sun'

const nextFrames = (n: number) => new Promise<void>((res) => { const step = () => (n-- <= 0 ? res() : requestAnimationFrame(step)); requestAnimationFrame(step) })

function flash() {
  const el = document.createElement('div')
  el.className = 'shutter-flash'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 700)
}

/** Full-resolution PNG of the current view with a small serif caption (title · world name · time). */
function captionedPng(): string | null {
  const src = document.querySelector('.stage canvas') as HTMLCanvasElement | null
  if (!src) return null
  const c = document.createElement('canvas')
  c.width = src.width; c.height = src.height
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  const s = useWorld.getState()
  const u = Math.max(c.height, c.width * 0.6) / 900
  const grd = g.createLinearGradient(0, c.height, 0, c.height - 160 * u)
  grd.addColorStop(0, 'rgba(10,16,32,0.42)'); grd.addColorStop(1, 'rgba(10,16,32,0)')
  g.fillStyle = grd; g.fillRect(0, c.height - 160 * u, c.width, 160 * u)
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12 * u
  g.fillStyle = '#ffffff'
  g.font = `700 ${26 * u}px "Noto Serif SC", serif`
  g.fillText('如果世界听你的', 34 * u, c.height - 58 * u)
  g.font = `500 ${13 * u}px "Noto Serif SC", serif`
  g.fillStyle = 'rgba(255,255,255,0.82)'
  g.fillText(`「${s.name || '未命名世界'}」 · ${timeLabel(s.time)} ${phaseName(s.time)}`, 36 * u, c.height - 32 * u)
  return c.toDataURL('image/png')
}

function snapshot(maxW: number, type = 'image/png', q?: number): string | null {
  const c = document.querySelector('.stage canvas') as HTMLCanvasElement | null
  if (!c) return null
  if (maxW >= c.width) return c.toDataURL(type, q)
  const k = maxW / c.width
  const off = document.createElement('canvas')
  off.width = Math.round(c.width * k); off.height = Math.round(c.height * k)
  off.getContext('2d')!.drawImage(c, 0, 0, off.width, off.height)
  return off.toDataURL(type, q)
}

const fmtDate = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function SavePanel() {
  const name = useWorld((s) => s.name)
  const setName = useWorld((s) => s.setName)
  const toast = useWorld((s) => s.toast)
  const [saves, setSaves] = useState<SavedWorld[]>(() => listSaves())
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (busy) return
    setBusy(true)
    const st = useWorld.getState()
    const doc = st.getDoc()
    const list = listSaves()
    const existing = list.find((s) => s.name === doc.name)
    // auto-framing: glide to the hero composition, take the postcard, glide back
    const pose = cameraApi.getPose()
    await cameraApi.glide(undefined, 1.1)
    await nextFrames(2)
    const thumb = snapshot(176, 'image/jpeg', 0.72) ?? undefined
    flash()
    if (pose) cameraApi.glide(pose, 1.1)
    setBusy(false)
    const entry: SavedWorld = { id: existing?.id ?? `w${Date.now().toString(36)}`, name: doc.name || '未命名世界', savedAt: Date.now(), doc, thumb }
    const next = [entry, ...list.filter((s) => s.id !== entry.id)].slice(0, 12)
    try {
      writeSaves(next)
      setSaves(next)
      toast(existing ? `已更新「${entry.name}」` : `已保存「${entry.name}」到本机`, 'ok')
    } catch {
      toast('保存失败：浏览器存储空间不足', 'error')
    }
  }
  const remove = (id: string) => { const next = listSaves().filter((s) => s.id !== id); writeSaves(next); setSaves(next) }
  const load = (s: SavedWorld) => { useWorld.getState().loadDoc(s.doc); toast(`已载入「${s.name}」`, 'ok') }
  const exportPng = () => {
    const url = captionedPng()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${(useWorld.getState().name || 'world').replace(/[\\/:*?"<>|]/g, '_')}.png`
    a.click()
    toast('图片已导出', 'ok')
  }
  return (
    <div className="popover glass" data-testid="panel-save">
      <div className="panel-title">保存世界</div>
      <div className="field-row">
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="给你的世界起个名字" aria-label="世界名称" data-testid="world-name" maxLength={40} />
        <button className="pill primary" onClick={save} disabled={busy} data-testid="save-local"><Icon name="save" size={16} />{busy ? '取景中…' : '保存'}</button>
      </div>
      <div className="panel-note">保存时镜头会自动回到最佳取景拍一张封面。存档只保存在这台设备的浏览器里，不会上传；当前世界也会自动续存。</div>
      {saves.length > 0 && (
        <ul className="save-list" data-testid="save-list">
          {saves.map((s) => (
            <li key={s.id}>
              <button className="save-item" onClick={() => load(s)} title="载入">
                {s.thumb ? <img src={s.thumb} alt="" /> : <span className="thumb-ph" />}
                <span className="save-meta"><b>{s.name}</b><small>{fmtDate(s.savedAt)}</small></span>
              </button>
              <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`删除 ${s.name}`}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="panel-actions">
        <button className="pill" onClick={exportPng} data-testid="export-png"><Icon name="image" size={16} />导出图片</button>
        {confirmReset ? (
          <button className="pill danger" onClick={() => { useWorld.getState().resetWorld(); setConfirmReset(false); toast('世界已重置') }} data-testid="reset-confirm">确定重置？</button>
        ) : (
          <button className="pill" onClick={() => setConfirmReset(true)} data-testid="reset-world"><Icon name="restore" size={16} />重置世界</button>
        )}
      </div>
    </div>
  )
}

function SharePanel() {
  const toast = useWorld((s) => s.toast)
  const [link, setLink] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    let seq = 0
    let timer = 0
    const schedule = () => {
      const ticket = ++seq
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        encodeShare(useWorld.getState().getDoc()).then((code) => {
          if (!alive || ticket !== seq) return
          setLink(`${location.origin}${location.pathname}#w=${code}`)
        }).catch(() => {})
      }, 200)
    }
    const unsub = useWorld.subscribe((s, prev) => {
      if (s.name === prev.name && s.time === prev.time && s.weather === prev.weather && s.gravity === prev.gravity && s.orbit === prev.orbit && s.objects === prev.objects && s.clouds === prev.clouds && JSON.stringify(s.sunLook) === JSON.stringify(prev.sunLook)) return
      schedule()
    })
    schedule()
    return () => { alive = false; unsub(); clearTimeout(timer) }
  }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast('链接已复制，发给朋友就能看到你的世界', 'ok')
    } catch {
      input.current?.select()
      const ok = document.execCommand?.('copy')
      toast(ok ? '链接已复制' : '请手动复制上面的链接', ok ? 'ok' : 'info')
    }
  }
  const canShare = typeof navigator.share === 'function'
  return (
    <div className="popover glass" data-testid="panel-share">
      <div className="panel-title">分享世界</div>
      <div className="field-row">
        <input ref={input} className="text-input mono" value={link || '生成中…'} readOnly onFocus={(e) => e.target.select()} aria-label="分享链接" data-testid="share-link" />
        <button className="pill primary" onClick={copy} disabled={!link} data-testid="copy-link"><Icon name="link" size={16} />复制</button>
      </div>
      <div className="panel-note">链接本身包含整个世界（物体、天气、时间、规则），打开即可还原，无需账号。</div>
      {canShare && link && (
        <button className="pill wide" onClick={() => navigator.share({ title: useWorld.getState().name, text: '来看看我创造的世界', url: link }).catch(() => {})}>
          <Icon name="share" size={16} />通过系统分享
        </button>
      )}
    </div>
  )
}

/** Single Save | Share pill (top-right) with popovers. */
export function TopActions() {
  const panel = useWorld((s) => s.panel)
  const togglePanel = useWorld((s) => s.togglePanel)
  return (
    <div className="top-actions">
      <div className="action-pill glass">
        <button className={panel === 'save' ? 'on' : ''} onClick={() => togglePanel('save')} data-testid="open-save" aria-expanded={panel === 'save'}><Icon name="save" size={17} /><span>保存</span></button>
        <span className="pill-sep" />
        <button className={panel === 'share' ? 'on' : ''} onClick={() => togglePanel('share')} data-testid="open-share" aria-expanded={panel === 'share'}><Icon name="share" size={17} /><span>分享</span></button>
      </div>
      {panel === 'save' && <SavePanel />}
      {panel === 'share' && <SharePanel />}
    </div>
  )
}
