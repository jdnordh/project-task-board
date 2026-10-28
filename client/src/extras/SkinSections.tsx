/**
 * SkinSections — the Extras part of the colour picker: all 12 camos
 * (locked ones disabled) and only the animated skins already earned. A
 * locked animated skin is never shown, so the picker can't give a secret away.
 */

import { useContext } from 'react'
import { CAMOS, SKINS } from '../lib'
import { Icon } from '../components/Icon'
import { Swatch, type Pick } from '../components/ColorPicker'
import { capStyle } from '../components/ui'
import { ExtrasContext, skinMini } from './skins'

export function SkinSections({ value, onPick }: { value: Pick; onPick: (p: Pick) => void }) {
  const { points, camos, earned } = useContext(ExtrasContext)
  const animated = SKINS.filter((s) => earned.has(s.secret))
  return (
    <>
      <div>
        <div style={{ ...capStyle, marginBottom: 8 }}>Camo · {points} pts</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CAMOS.map((c) => {
            const open = camos.has(c.id)
            return (
              <Swatch key={c.id} background={`var(--grove-tex-camo-${c.id}) center / 64px`} disabled={!open}
                title={open ? c.name : `${c.name} — ${c.unlockAt - points} pts to go`}
                selected={value.skin === c.id} onClick={() => onPick({ color: c.hex, skin: c.id })}>
                {!open && (
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', backdropFilter: 'grayscale(1) brightness(.45)' }}>
                    <Icon name="lock" size={12} color="#fff" />
                  </span>
                )}
                {open && value.skin === c.id && <Icon name="check" size={15} color="#fff" strokeWidth={3} style={{ filter: 'drop-shadow(0 1px 2px #000)' }} />}
              </Swatch>
            )
          })}
        </div>
      </div>
      {animated.length > 0 && (
        <div>
          <div style={{ ...capStyle, marginBottom: 8 }}>Animated · {animated.length} of {SKINS.length}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {animated.map((s) => (
              <Swatch key={s.id} title={s.name} selected={value.skin === s.id} onClick={() => onPick({ color: s.hex, skin: s.id })}
                background={String(skinMini({ kind: 'anim', def: s }, 135).backgroundImage)} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
