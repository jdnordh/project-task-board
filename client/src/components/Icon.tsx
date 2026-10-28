/**
 * Icon — Lucide icons referenced by name, plus the custom Claude glyph.
 */

import type { CSSProperties } from 'react'
import {
  Columns3, Layers, Trophy, Settings, Inbox, Calendar, Play, OctagonX, CheckCheck, Timer, ListChecks, Clock,
  CircleHelp, Eye, CircleCheck, FileText, Copy, ChevronsLeft, Search, Plus, X, Pencil, Trash2, Lock, Lightbulb,
  LayoutTemplate, User, ChevronDown, Check, Minus, Link, Bold, Italic, List, ListOrdered, Code, Heading2,
  ExternalLink, Filter, Sparkles, RotateCcw, NotebookPen, ImagePlus, ListTodo, FolderGit2, RefreshCw, ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'columns-3': Columns3, layers: Layers, trophy: Trophy, settings: Settings, inbox: Inbox, calendar: Calendar,
  play: Play, 'octagon-x': OctagonX, 'check-check': CheckCheck, timer: Timer, 'list-checks': ListChecks, clock: Clock,
  'circle-help': CircleHelp, eye: Eye, 'circle-check': CircleCheck, 'file-text': FileText, copy: Copy,
  'chevrons-left': ChevronsLeft, search: Search, plus: Plus, x: X, pencil: Pencil, 'trash-2': Trash2, lock: Lock,
  lightbulb: Lightbulb, 'layout-template': LayoutTemplate, user: User, 'chevron-down': ChevronDown, check: Check,
  minus: Minus, link: Link, bold: Bold, italic: Italic, list: List, 'list-ordered': ListOrdered, code: Code,
  heading: Heading2, 'external-link': ExternalLink, filter: Filter, sparkles: Sparkles, 'rotate-ccw': RotateCcw,
  'notebook-pen': NotebookPen, 'image-plus': ImagePlus, 'list-todo': ListTodo, 'folder-git-2': FolderGit2,
  'refresh-cw': RefreshCw, 'arrow-up-right': ArrowUpRight,
}

interface IconProps {
  name: string
  size?: number
  color?: string
  strokeWidth?: number
  style?: CSSProperties
  className?: string
  fill?: string
}

/** Claude's starburst, drawn as rays so it sits with the stroke icons. */
function ClaudeGlyph({ size = 16, color = 'currentColor', style, className }: IconProps) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden="true">
      {rays.map((deg, i) => (
        <line key={deg} x1="12" y1="12" x2="12" y2={i % 2 ? 4.2 : 2.2} stroke={color} strokeWidth="2.3" strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  )
}

export function Icon(props: IconProps) {
  const { name, size = 16, color, strokeWidth = 2, style, className, fill } = props
  if (name === 'claude') return <ClaudeGlyph {...props} />
  const C = ICONS[name]
  if (!C) return null
  return <C size={size} color={color} strokeWidth={strokeWidth} style={{ flexShrink: 0, ...style }} className={className} fill={fill ?? 'none'} aria-hidden="true" />
}
