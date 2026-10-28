/**
 * skin.tsx — every feature colour render goes through here, so skins
 * (Extras) take over in one place via useSkin.
 */

import type { CSSProperties } from 'react'
import type { Feature } from '../types'
import { useSkin, skinMini } from '../extras/skins'

export function FeatureDot({ feature, size = 7, style }: { feature: Pick<Feature, 'color' | 'skin'>; size?: number; style?: CSSProperties }) {
  const skin = useSkin(feature.skin)
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: feature.color, flexShrink: 0, display: 'inline-block',
      ...(skin ? skinMini(skin, 135) : {}), ...style,
    }} />
  )
}

export function FeatureStripe({ feature, width = 4, style }: { feature: Pick<Feature, 'color' | 'skin'>; width?: number; style?: CSSProperties }) {
  const skin = useSkin(feature.skin)
  return <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width, background: feature.color, ...(skin ? skinMini(skin) : {}), ...style }} />
}
