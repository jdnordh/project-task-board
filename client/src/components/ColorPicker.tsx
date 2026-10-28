/**
 * ColorPicker — the 14 palette swatches. With Extras on, the skin
 * sections (camos, earned animated skins) are added by SkinSections.
 */

import type { ReactNode } from 'react'
import { FEATURE_PALETTE } from '../lib'
import { Icon } from './Icon'

export interface Pick {
  color: string
  skin: string | null
}

export function Swatch({ selected, title, onClick, disabled, children, background }: {
  selected: boolean; title: string; onClick: () => void; disabled?: boolean; children?: ReactNode; background: string
}) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={selected} disabled={disabled} onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 8, padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative',
        background, backgroundSize: 'cover', border: 'none', overflow: 'hidden',
        boxShadow: selected ? '0 0 0 2px var(--bg-1), 0 0 0 4px var(--fg-1)' : 'inset 0 0 0 1px rgba(255,255,255,.12)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
      {children}
      {selected && !children && <Icon name="check" size={15} color="#06150c" strokeWidth={3} />}
    </button>
  )
}

export function PaletteRow({ value, onPick }: { value: Pick; onPick: (p: Pick) => void }) {
  // A colour from before the palette (e.g. an imported project) stays pickable.
  const custom = !value.skin && !FEATURE_PALETTE.some((p) => p.hex.toLowerCase() === value.color.toLowerCase())
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {custom && <Swatch title="Current colour" background={value.color} selected onClick={() => {}} />}
      {FEATURE_PALETTE.map((p) => (
        <Swatch key={p.id} title={p.name} background={p.hex}
          selected={!value.skin && value.color.toLowerCase() === p.hex.toLowerCase()}
          onClick={() => onPick({ color: p.hex, skin: null })} />
      ))}
    </div>
  )
}

export function ColorPicker({ value, onPick, extraSections }: { value: Pick; onPick: (p: Pick) => void; extraSections?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PaletteRow value={value} onPick={onPick} />
      {extraSections}
    </div>
  )
}
