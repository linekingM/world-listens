import { useEffect, useState } from 'react'
import { useWorld } from '../state/worldStore'
import type { CloudObject, WorldObject } from '../state/types'
import { OBJECT_KINDS } from '../world/objects'
import { sims } from '../scene/systems/simulation'
import { terrainHeight } from '../world/layout'
import { Icon, type IconName } from './icons'

function ToolBtn({ icon, label, onClick, danger, active }: { icon: IconName; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button className={`tb-btn${danger ? ' danger' : ''}${active ? ' on' : ''}`} onClick={onClick} title={label} aria-label={label} data-act={label}>
      <Icon name={icon} size={18} />
    </button>
  )
}

export function ObjectActions({ obj }: { obj: WorldObject }) {
  const st = useWorld.getState()
  const kind = OBJECT_KINDS[obj.type]
  const up = (patch: Partial<WorldObject>) => st.updateObject(obj.id, patch)
  return (
    <>
      <span className="tb-label">{kind.label}</span>
      <ToolBtn icon="rotL" label="向左转" onClick={() => up({ rotY: obj.rotY + Math.PI / 6 })} />
      <ToolBtn icon="rotR" label="向右转" onClick={() => up({ rotY: obj.rotY - Math.PI / 6 })} />
      <ToolBtn icon="minus" label="缩小" onClick={() => up({ scale: Math.max(0.4, +(obj.scale / 1.15).toFixed(2)) })} />
      <ToolBtn icon="plus" label="放大" onClick={() => up({ scale: Math.min(kind.airborne ? 1.8 : 2.5, +(obj.scale * 1.15).toFixed(2)) })} />
      {kind.airborne ? (
        <>
          <ToolBtn icon="up" label="升高" onClick={() => up({ pos: [obj.pos[0], Math.min(90, obj.pos[1] + 4), obj.pos[2]] })} />
          <ToolBtn icon="down" label="降低" onClick={() => up({ pos: [obj.pos[0], Math.max(terrainHeight(obj.pos[0], obj.pos[2]) + 12, obj.pos[1] - 4), obj.pos[2]] })} />
        </>
      ) : (
        <ToolBtn icon="float" label={obj.floating ? '落回地面' : '漂浮起来'} active={!!obj.floating} onClick={() => st.toggleFloat(obj.id)} />
      )}
      <span className="tb-sep" />
      <ToolBtn icon="trash" label="删除" danger onClick={() => { st.removeObject(obj.id); sims.delete(obj.id); st.toast(`已删除${kind.label}`) }} />
    </>
  )
}

export function CloudActions({ cloud }: { cloud: CloudObject }) {
  return (
    <>
      <span className="tb-label">云朵</span>
      <button className="tb-btn wide" data-act="化为浮岛" onClick={() => {
        const st = useWorld.getState()
        st.cloudToIsland(cloud.id)
        st.toast('云朵凝结成了一座浮岛', 'ok')
      }}>
        <Icon name="island" size={18} /><span>化为浮岛</span>
      </button>
    </>
  )
}

export function useIsCompact() {
  const q = '(max-width: 720px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Phone layout: selection actions dock above the tool rail instead of floating in the scene. */
export function SelectionBar() {
  const compact = useIsCompact()
  const obj = useWorld((s) => s.objects.find((o) => o.id === s.selectedId))
  const cloud = useWorld((s) => s.clouds.find((c) => c.id === s.selectedId))
  if (!compact || (!obj && !cloud)) return null
  return (
    <div className="selection-bar obj-toolbar glass" data-testid="selection-bar" onPointerDown={(e) => e.stopPropagation()}>
      {obj ? <ObjectActions obj={obj} /> : <CloudActions cloud={cloud!} />}
      <button className="tb-btn" onClick={() => useWorld.getState().select(null)} aria-label="完成" data-act="完成"><Icon name="check" size={18} /></button>
    </div>
  )
}
