/**
 * skins.tsx — the one gate for skins (`useSkin`) and the renderers.
 *
 * Performance rules: only transform/opacity animate, each moving layer is
 * its own <i> sized one tile bigger than the box and moved by a whole
 * tile, and nothing animates under reduced motion or while idle.
 */

import { createContext, useContext, type CSSProperties } from 'react'
import { CAMOS, SKINS } from '../lib'

export interface ExtrasState {
  extras: boolean
  points: number
  camos: Set<string>
  earned: Set<string>
}

export const ExtrasContext = createContext<ExtrasState>({ extras: false, points: 0, camos: new Set(), earned: new Set() })

export type CamoDef = (typeof CAMOS)[number]
export type AnimDef = (typeof SKINS)[number]
export type ResolvedSkin = { kind: 'camo'; def: CamoDef } | { kind: 'anim'; def: AnimDef }

/** Null when Extras is off, the id is unknown, or the skin is locked. */
export function useSkin(id: string | null | undefined): ResolvedSkin | null {
  const { extras, camos, earned } = useContext(ExtrasContext)
  if (!extras || !id) return null
  const camo = CAMOS.find((c) => c.id === id)
  if (camo) return camos.has(id) ? { kind: 'camo', def: camo } : null
  const anim = SKINS.find((s) => s.id === id)
  if (anim) return earned.has(anim.secret) ? { kind: 'anim', def: anim } : null
  return null
}

type Dir = 'up' | 'down' | 'left' | 'right'
interface Layer { image: string; tile: number; dir: Dir; speed: number; opacity?: number; blend?: CSSProperties['mixBlendMode'] }
interface AnimLook { base: string; layers: Layer[] }

const dots = (c: string, r: number, x = 50, y = 50) => `radial-gradient(circle at ${x}% ${y}%, ${c} ${r}px, transparent ${r + 1}px)`

export const ANIM_LOOKS: Record<string, AnimLook> = {
  fizz: {
    base: 'linear-gradient(160deg, #5a0012, #b0102c 55%, #e8173a)',
    layers: [
      { image: `${dots('rgba(255,190,205,.55)', 3, 30, 40)}, ${dots('rgba(255,255,255,.35)', 2, 75, 80)}`, tile: 40, dir: 'up', speed: 1 },
      { image: `${dots('rgba(255,143,163,.5)', 1.5, 20, 70)}, ${dots('rgba(255,255,255,.4)', 1, 70, 20)}`, tile: 26, dir: 'up', speed: 0.6 },
    ],
  },
  ember: {
    base: 'radial-gradient(120% 90% at 50% 120%, #ff7a2e, #c2410c 45%, #3a0a00)',
    layers: [
      { image: 'linear-gradient(90deg, transparent, rgba(255,209,102,.18) 50%, transparent)', tile: 140, dir: 'right', speed: 1.6, blend: 'screen' },
      { image: `${dots('rgba(255,209,102,.8)', 1.5, 25, 60)}, ${dots('rgba(255,122,46,.7)', 1.2, 70, 25)}`, tile: 34, dir: 'up', speed: 0.8 },
    ],
  },
  aurora: {
    base: 'linear-gradient(180deg, #031a14, #06281f 60%, #0b3b2c)',
    layers: [
      { image: 'repeating-linear-gradient(115deg, transparent 0 30px, rgba(46,230,166,.35) 60px, transparent 90px 160px)', tile: 160, dir: 'right', speed: 2.2, blend: 'screen' },
      { image: 'repeating-linear-gradient(65deg, transparent 0 40px, rgba(95,184,255,.25) 70px, transparent 100px 200px)', tile: 200, dir: 'left', speed: 3, blend: 'screen' },
    ],
  },
  party: {
    base: 'linear-gradient(120deg, #ff2e88, #ff5a5f 40%, #ff8a3d 70%, #ffb000)',
    layers: [
      { image: 'repeating-linear-gradient(45deg, rgba(255,255,255,.16) 0 8px, transparent 8px 16px)', tile: 32, dir: 'right', speed: 1 },
      { image: `${dots('#fff', 2, 20, 30)}, ${dots('#2ee6a6', 2, 70, 60)}, ${dots('#5fb8ff', 2, 40, 85)}`, tile: 48, dir: 'down', speed: 1.4, opacity: 0.8 },
    ],
  },
  darkmatter: {
    base: 'radial-gradient(130% 100% at 30% 20%, #2a3ad8 0%, #12145a 45%, #070822 100%)',
    layers: [
      { image: 'radial-gradient(60% 40% at 50% 50%, rgba(192,112,255,.35), transparent 70%)', tile: 200, dir: 'right', speed: 3, blend: 'screen' },
      { image: `${dots('rgba(216,208,246,.9)', 1, 15, 25)}, ${dots('rgba(216,208,246,.6)', 0.8, 60, 70)}, ${dots('rgba(255,255,255,.8)', 1.2, 85, 35)}`, tile: 64, dir: 'left', speed: 2.4 },
      { image: `${dots('rgba(192,112,255,.8)', 1.4, 35, 55)}, ${dots('rgba(255,255,255,.5)', 0.8, 80, 15)}`, tile: 90, dir: 'right', speed: 1.6 },
      { image: 'repeating-linear-gradient(100deg, transparent 0 60px, rgba(122,44,240,.18) 90px, transparent 120px 180px)', tile: 180, dir: 'up', speed: 2, blend: 'screen' },
    ],
  },
}

function layerStyle(l: Layer, dur: number): CSSProperties {
  const t = `${l.tile}px`
  const box: CSSProperties = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }
  if (l.dir === 'up') box.bottom = `-${t}`
  if (l.dir === 'down') box.top = `-${t}`
  if (l.dir === 'left') box.right = `-${t}`
  if (l.dir === 'right') box.left = `-${t}`
  const axis = l.dir === 'up' || l.dir === 'down' ? 'y' : 'x'
  const sign = l.dir === 'up' || l.dir === 'left' ? -1 : 1
  return {
    ...box,
    backgroundImage: l.image,
    backgroundSize: `${t} ${t}`,
    opacity: l.opacity ?? 1,
    mixBlendMode: l.blend,
    animation: `g-pan-${axis} ${dur * l.speed}s linear infinite`,
    ['--g-d' as string]: `${sign * l.tile}px`,
    willChange: 'transform',
  }
}

/** A full-strength skin filling its (positioned) parent. */
export function SkinBackdrop({ skin, style }: { skin: ResolvedSkin; style?: CSSProperties }) {
  if (skin.kind === 'camo') {
    return <span aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `var(--grove-tex-camo-${skin.def.id})`, backgroundSize: '256px', ...style }} />
  }
  const look = ANIM_LOOKS[skin.def.id]
  return (
    <span aria-hidden="true" className="g-skin" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: look?.base ?? skin.def.hex, ...style }}>
      {look?.layers.map((l, i) => <i key={i} style={layerStyle(l, skin.def.dur)} />)}
    </span>
  )
}

/** Small renders (stripe, dot, swatch): animated skins use the mini gradient, camos the texture at 64px. */
export function skinMini(skin: ResolvedSkin, angle = 180): CSSProperties {
  if (skin.kind === 'camo') return { backgroundImage: `var(--grove-tex-camo-${skin.def.id})`, backgroundSize: '64px' }
  return { backgroundImage: `linear-gradient(${angle}deg, ${skin.def.mini.join(', ')})` }
}
