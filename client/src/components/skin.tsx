/**
 * skin.tsx — every feature colour render goes through here, so skins
 * (Extras) can take over in one place.
 */

import type { CSSProperties } from 'react'
import type { Feature } from '../types'

export function FeatureDot({ feature, size = 7, style }: { feature: Pick<Feature, 'color' | 'skin'>; size?: number; style?: CSSProperties }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: feature.color, flexShrink: 0, display: 'inline-block', ...style }} />
}

export function FeatureStripe({ feature, width = 4, style }: { feature: Pick<Feature, 'color' | 'skin'>; width?: number; style?: CSSProperties }) {
  return <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width, background: feature.color, ...style }} />
}
