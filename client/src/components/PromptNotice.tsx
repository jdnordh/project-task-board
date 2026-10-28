/**
 * PromptNotice — bottom-right notice after a card enters the Claude column.
 * Copied: auto-closes after 6s unless hovered. Blocked: shows the prompt
 * with a Copy button (a real click, which always works).
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Button, IconButton } from './ui'
import { copyText } from '../clipboard'

export interface NoticeSpec {
  key: number
  title: string
  text: string
  setup: string
  copied: boolean
}

export function PromptNotice({ spec, onClose }: { spec: NoticeSpec; onClose: () => void }) {
  const [copied, setCopied] = useState(spec.copied)
  const [hover, setHover] = useState(false)
  const [justCopied, setJustCopied] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!copied || hover) return
    const id = setTimeout(onClose, 6000)
    return () => clearTimeout(id)
  }, [copied, hover, onClose])

  const copyNow = () => {
    taRef.current?.select()
    copyText(spec.text).then((ok) => {
      if (ok) {
        setJustCopied(true)
        setTimeout(() => setCopied(true), 900)
      }
    })
  }

  return (
    <div role="status" className="g-rise" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed', right: 20, bottom: 20, width: 360, maxWidth: 'calc(100vw - 32px)', zIndex: 100,
        background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)', padding: 16, animation: 'grove-rise var(--dur-base) var(--ease-grow) both',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: copied ? 'var(--success-tint)' : 'var(--warning-tint)' }}>
          <Icon name={copied ? 'check' : 'claude'} size={15} color={copied ? 'var(--success)' : 'var(--warning)'} />
        </span>
        <strong style={{ flex: 1, color: 'var(--fg-1)', fontSize: 14 }}>{copied ? 'Prompt copied' : 'Copy the prompt for Claude'}</strong>
        <IconButton icon="x" label="Close" size={26} onClick={onClose} />
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.45 }}>
        {copied
          ? 'Paste it into a new Claude Code chat. The card shows its status here.'
          : 'The browser blocked the copy. Click Copy, then paste it into a new Claude Code chat.'}
      </p>
      {spec.setup && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--fg-2)' }}>
          Pick <strong style={{ color: 'var(--accent-fg)' }}>{spec.setup}</strong> before you paste.
        </p>
      )}
      <div style={{ fontSize: 12, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spec.title}</div>
      {!copied && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea ref={taRef} readOnly value={spec.text} rows={4} className="g-input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, resize: 'none' }} onFocus={(e) => e.target.select()} />
          <Button variant="primary" size="sm" icon={justCopied ? 'check' : 'copy'} onClick={copyNow} style={{ alignSelf: 'flex-end' }}>
            {justCopied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  )
}
