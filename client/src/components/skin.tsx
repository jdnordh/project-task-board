/**
 * skin.tsx — every project colour render goes through here, so skins
 * (Extras) take over in one place via useSkin.
 */

import type { CSSProperties } from 'react'
import type { Project } from '../types'
import { useSkin, skinMini } from '../extras/skins'

export function ProjectDot({ project, size = 7, style }: { project: Pick<Project, 'color' | 'skin'>; size?: number; style?: CSSProperties }) {
  const skin = useSkin(project.skin)
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: project.color, flexShrink: 0, display: 'inline-block',
      ...(skin ? skinMini(skin, 135) : {}), ...style,
    }} />
  )
}

export function ProjectStripe({ project, width = 4, style }: { project: Pick<Project, 'color' | 'skin'>; width?: number; style?: CSSProperties }) {
  const skin = useSkin(project.skin)
  return <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width, background: project.color, ...(skin ? skinMini(skin) : {}), ...style }} />
}
