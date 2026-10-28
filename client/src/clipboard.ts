/**
 * clipboard.ts — copy text. Starts synchronously so a drop's leftover user
 * activation still counts: Clipboard API first, then a hidden read-only
 * textarea + execCommand('copy').
 */

function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.readOnly = true
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

export function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text))
    }
  } catch {
    // fall through to the textarea copy
  }
  return Promise.resolve(fallbackCopy(text))
}
