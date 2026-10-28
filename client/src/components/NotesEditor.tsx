/**
 * NotesEditor — TipTap rich text (StarterKit: headings, bold, italic, lists,
 * code, links). No checkbox task-list: subtasks are the checklist.
 * Ctrl/Cmd+K opens a link popover. Links are not inclusive, so text typed
 * right after a link does not join it.
 */

import { useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import { Icon } from './Icon'
import { Button, usePopover } from './ui'

const NonInclusiveLink = Link.extend({ inclusive: () => false })

interface Props {
  initialHtml: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  minHeight?: number
}

function ToolButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="g-btn g-icon-btn"
      style={{
        width: 28, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
        background: active ? 'var(--accent-tint)' : 'transparent', color: active ? 'var(--accent-fg)' : 'var(--fg-3)',
      }}>
      <Icon name={icon} size={14} />
    </button>
  )
}

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState<string>(editor.getAttributes('link').href ?? '')
  const ref = usePopover(true, onClose)
  const apply = () => {
    const href = url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!href) chain.unsetLink().run()
    else {
      const full = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`
      if (editor.state.selection.empty && !editor.isActive('link')) {
        editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href: full } }] }).run()
      } else chain.setLink({ href: full }).run()
    }
    onClose()
  }
  return (
    <div ref={ref} style={{
      position: 'absolute', top: 36, left: 6, zIndex: 20, width: 300, display: 'flex', gap: 6, padding: 8,
      background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 10, boxShadow: 'var(--shadow-lg)',
    }}>
      <input autoFocus className="g-input" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }} style={{ padding: '6px 9px', fontSize: 13 }} />
      <Button size="sm" variant="primary" onClick={apply}>{url.trim() ? 'Apply' : 'Remove'}</Button>
    </div>
  )
}

export function NotesEditor({ initialHtml, onChange, placeholder = 'Add notes…', minHeight = 110 }: Props) {
  const [linkOpen, setLinkOpen] = useState(false)
  const openLink = useRef(() => setLinkOpen(true))
  const [, force] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
      NonInclusiveLink.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: 'linkShortcut',
        addKeyboardShortcuts: () => ({ 'Mod-k': () => { openLink.current(); return true } }),
      }),
    ],
    content: initialHtml || '',
    onUpdate: ({ editor: ed }) => {
      if (ed.isEmpty) onChange('', '')
      else onChange(ed.getHTML(), ed.getText({ blockSeparator: '\n' }))
    },
    onSelectionUpdate: () => force((n) => n + 1),
  })

  if (!editor) return null
  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs)

  return (
    <div className="g-notes" style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-0)' }}>
      <div style={{ display: 'flex', gap: 2, padding: 4, borderBottom: '1px solid var(--border)' }}>
        <ToolButton icon="heading" label="Heading" active={is('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolButton icon="bold" label="Bold" active={is('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolButton icon="italic" label="Italic" active={is('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolButton icon="list" label="Bulleted list" active={is('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolButton icon="list-ordered" label="Numbered list" active={is('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolButton icon="code" label="Code" active={is('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolButton icon="link" label="Link (Ctrl+K)" active={is('link')} onClick={() => setLinkOpen(true)} />
      </div>
      {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      <div style={{ padding: '10px 12px', minHeight, cursor: 'text' }} onClick={() => editor.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
